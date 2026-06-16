import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { query } from '@/lib/db';
import { verifyToken, getTokenFromRequest } from '@/lib/auth';
import { getStorage, storageKey } from '@/lib/storage';
import { processImageWithGemini } from '@/lib/gemini';

async function applyLogo(imageBuffer: Buffer, logoBuffer: Buffer): Promise<Buffer> {
  const meta = await sharp(imageBuffer).metadata();
  const imageWidth = meta.width ?? 1200;
  const format = meta.format;

  const logoWidth = Math.round(imageWidth * 0.15);
  const padding = Math.round(imageWidth * 0.02);

  const resizedLogo = await sharp(logoBuffer)
    .resize(logoWidth, undefined, { fit: 'inside' })
    .toBuffer();

  const composited = sharp(imageBuffer)
    .composite([{ input: resizedLogo, top: padding, left: padding }]);

  if (format === 'png') {
    return composited.png({ compressionLevel: 6 }).toBuffer();
  }
  return composited.jpeg({ quality: 100, chromaSubsampling: '4:4:4' }).toBuffer();
}

export async function POST(req: NextRequest) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const { image_id } = await req.json();
    if (!image_id) return NextResponse.json({ error: 'Missing image_id' }, { status: 400 });

    const result = await query(
      'SELECT id, user_id, original_filename, raw_path FROM images WHERE id = $1',
      [image_id]
    );
    if (result.rows.length === 0) return NextResponse.json({ error: 'Image not found' }, { status: 404 });

    const image = result.rows[0];
    if (image.user_id !== payload.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    // Fire and forget — respond immediately so Vercel doesn't time out the request
    processAsync(image, payload.userId).catch((err) =>
      console.error('Background process error:', err)
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Process trigger error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function processAsync(
  image: { id: number; user_id: number; original_filename: string; raw_path: string },
  userId: number
) {
  const storage = getStorage();
  let retries = 0;
  const maxRetries = 3;

  while (retries < maxRetries) {
    try {
      await query("UPDATE images SET status = 'processing' WHERE id = $1", [image.id]);

      const mimeType = image.original_filename.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
      const rawBuffer = await storage.download(image.raw_path);
      let editedBuffer = await processImageWithGemini(rawBuffer, mimeType);

      const logoResult = await query('SELECT logo_path FROM users WHERE id = $1', [userId]);
      const logoPath = logoResult.rows[0]?.logo_path;
      if (logoPath) {
        try {
          const logoBuffer = await storage.download(logoPath);
          editedBuffer = await applyLogo(editedBuffer, logoBuffer);
        } catch (logoErr) {
          console.warn('Logo compositing failed, saving without logo:', logoErr);
        }
      }

      // Derive vinName from raw_path: "{userId}/{vinName}/raw/{filename}"
      const vinName = image.raw_path.split('/')[1];
      const editedKey = storageKey(userId, vinName, 'edited', `edited_${image.original_filename}`);
      await storage.upload(editedKey, editedBuffer, mimeType);

      await query(
        "UPDATE images SET status = 'done', edited_path = $1, processed_at = NOW() WHERE id = $2",
        [editedKey, image.id]
      );
      return;
    } catch (error) {
      retries++;
      console.error(`Processing attempt ${retries}/${maxRetries} failed for image ${image.id}:`, error);

      if (retries >= maxRetries) {
        await query(
          "UPDATE images SET status = 'failed', error_message = $1, retry_count = $2 WHERE id = $3",
          [(error as any).message, retries, image.id]
        );
        // Refund the credit
        await query('UPDATE users SET credits_remaining = credits_remaining + 1 WHERE id = $1', [userId]);
        await query(
          'INSERT INTO credit_transactions (user_id, delta, reason, image_id) VALUES ($1, $2, $3, $4)',
          [userId, 1, 'processing_failed', image.id]
        );
        return;
      }

      await new Promise((r) => setTimeout(r, Math.pow(2, retries) * 1000));
    }
  }
}
