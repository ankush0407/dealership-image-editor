import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { query } from '@/lib/db';
import { verifyToken, getTokenFromRequest } from '@/lib/auth';
import { processImageWithGemini } from '@/lib/gemini';
import { getStorage, storageKey } from '@/lib/storage';

export async function POST(req: NextRequest) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const formData = await req.formData();
    const vinFolderId = formData.get('vin_folder_id') as string;
    const files = formData.getAll('files') as File[];

    if (!vinFolderId || !files || files.length === 0) {
      return NextResponse.json({ error: 'Missing vin_folder_id or files' }, { status: 400 });
    }

    const folderResult = await query(
      'SELECT id FROM vin_folders WHERE id = $1 AND user_id = $2',
      [vinFolderId, payload.userId]
    );
    if (folderResult.rows.length === 0) {
      return NextResponse.json({ error: 'VIN folder not found' }, { status: 404 });
    }

    const vinResult = await query('SELECT vin_name FROM vin_folders WHERE id = $1', [vinFolderId]);
    const vinName = vinResult.rows[0].vin_name;

    const userResult = await query('SELECT credits_remaining FROM users WHERE id = $1', [payload.userId]);
    const creditsRemaining = userResult.rows[0].credits_remaining;

    if (creditsRemaining < files.length) {
      return NextResponse.json(
        { error: `Insufficient credits. You have ${creditsRemaining} credits but need ${files.length}` },
        { status: 400 }
      );
    }

    const storage = getStorage();
    const uploadedImages = [];

    for (const file of files) {
      if (!['image/jpeg', 'image/png'].includes(file.type)) continue;

      const filename = file.name;
      const buffer = Buffer.from(await file.arrayBuffer());
      const rawKey = storageKey(payload.userId, vinName, 'raw', filename);

      await storage.upload(rawKey, buffer, file.type);

      const imageResult = await query(
        'INSERT INTO images (vin_folder_id, user_id, original_filename, raw_path, status) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [vinFolderId, payload.userId, filename, rawKey, 'queued']
      );
      const imageId = imageResult.rows[0].id;

      await query('UPDATE users SET credits_remaining = credits_remaining - 1 WHERE id = $1', [payload.userId]);
      await query(
        'INSERT INTO credit_transactions (user_id, delta, reason, image_id) VALUES ($1, $2, $3, $4)',
        [payload.userId, -1, 'image_processing', imageId]
      );

      uploadedImages.push({ id: imageId, filename, status: 'queued' });

      processImageAsync(imageId, payload.userId, vinName, filename, rawKey, file.type);
    }

    return NextResponse.json({ success: true, images: uploadedImages });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

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

  // Maximum JPEG quality with 4:4:4 chroma subsampling to avoid colour compression
  return composited.jpeg({ quality: 100, chromaSubsampling: '4:4:4' }).toBuffer();
}

async function processImageAsync(
  imageId: number,
  userId: number,
  vinName: string,
  filename: string,
  rawKey: string,
  mimeType: string
) {
  let retries = 0;
  const maxRetries = 3;

  while (retries < maxRetries) {
    try {
      await query('UPDATE images SET status = $1 WHERE id = $2', ['processing', imageId]);

      const storage = getStorage();
      const rawBuffer = await storage.download(rawKey);
      let editedBuffer = await processImageWithGemini(rawBuffer, mimeType);

      // Composite the user's logo onto the top-left corner if one is set
      const logoResult = await query('SELECT logo_path FROM users WHERE id = $1', [userId]);
      const logoPath = logoResult.rows[0]?.logo_path;
      if (logoPath) {
        try {
          const logoBuffer = await storage.download(logoPath);
          editedBuffer = await applyLogo(editedBuffer, logoBuffer);
        } catch (logoError) {
          console.warn('Logo compositing failed, saving without logo:', logoError);
        }
      }

      const editedKey = storageKey(userId, vinName, 'edited', `edited_${filename}`);
      await storage.upload(editedKey, editedBuffer, mimeType);

      await query(
        'UPDATE images SET status = $1, edited_path = $2, processed_at = NOW() WHERE id = $3',
        ['done', editedKey, imageId]
      );
      return;
    } catch (error) {
      retries++;
      console.error(`Image processing attempt ${retries}/${maxRetries} failed:`, error);

      if (retries >= maxRetries) {
        await query(
          'UPDATE images SET status = $1, error_message = $2, retry_count = $3 WHERE id = $4',
          ['failed', (error as any).message, retries, imageId]
        );
        await query('UPDATE users SET credits_remaining = credits_remaining + 1 WHERE id = $1', [userId]);
        await query(
          'INSERT INTO credit_transactions (user_id, delta, reason, image_id) VALUES ($1, $2, $3, $4)',
          [userId, 1, 'processing_failed', imageId]
        );
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, Math.pow(2, retries) * 1000));
    }
  }
}
