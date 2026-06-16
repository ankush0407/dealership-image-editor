import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { query } from '@/lib/db';
import { verifyToken, getTokenFromRequest } from '@/lib/auth';
import { getStorage } from '@/lib/storage';

async function compositeLogoOnImage(imageBuffer: Buffer, logoBuffer: Buffer): Promise<Buffer> {
  const meta = await sharp(imageBuffer).metadata();
  const imageWidth = meta.width ?? 1200;
  const logoWidth = Math.round(imageWidth * 0.15);
  const padding = Math.round(imageWidth * 0.02);

  const resizedLogo = await sharp(logoBuffer)
    .resize(logoWidth, undefined, { fit: 'inside' })
    .toBuffer();

  return sharp(imageBuffer)
    .composite([{ input: resizedLogo, top: padding, left: padding }])
    .jpeg({ quality: 92 })
    .toBuffer();
}

export async function POST(req: NextRequest) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const userResult = await query('SELECT logo_path FROM users WHERE id = $1', [payload.userId]);
    const logoPath = userResult.rows[0]?.logo_path;
    if (!logoPath) {
      return NextResponse.json({ error: 'No logo set. Upload a logo first.' }, { status: 400 });
    }

    // Fetch all processed images for this user
    const imagesResult = await query(
      `SELECT id, edited_path, original_filename
       FROM images
       WHERE user_id = $1 AND status = 'done' AND edited_path IS NOT NULL`,
      [payload.userId]
    );

    const images = imagesResult.rows;
    if (images.length === 0) {
      return NextResponse.json({ success: true, updated: 0, message: 'No processed images found.' });
    }

    const storage = getStorage();
    const logoBuffer = await storage.download(logoPath);

    // Apply logo to each edited image and re-upload
    applyLogoToExisting(images, logoBuffer, storage).catch((err) =>
      console.error('Background logo apply error:', err)
    );

    return NextResponse.json({
      success: true,
      updated: images.length,
      message: `Applying logo to ${images.length} image${images.length !== 1 ? 's' : ''} in the background.`,
    });
  } catch (error) {
    console.error('Apply logo to existing error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function applyLogoToExisting(
  images: { id: number; edited_path: string; original_filename: string }[],
  logoBuffer: Buffer,
  storage: ReturnType<typeof getStorage>
) {
  for (const image of images) {
    try {
      const editedBuffer = await storage.download(image.edited_path);
      const withLogo = await compositeLogoOnImage(editedBuffer, logoBuffer);
      // Overwrite the existing edited file in Supabase
      await storage.upload(image.edited_path, withLogo, 'image/jpeg');
      console.log(`Logo applied to image ${image.id} (${image.original_filename})`);
    } catch (err) {
      console.error(`Failed to apply logo to image ${image.id}:`, err);
    }
  }
}
