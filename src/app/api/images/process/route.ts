import { NextRequest, NextResponse, after } from 'next/server';
import sharp from 'sharp';
import { query } from '@/lib/db';
import { verifyToken, getTokenFromRequest } from '@/lib/auth';
import { getStorage, storageKey } from '@/lib/storage';
import { processImageWithGemini } from '@/lib/gemini';
import { isListingComplete, buildCaption, buildListingUrl } from '@/lib/social';

// Allow up to 5 minutes — Gemini image generation can take 30-90 seconds per image.
export const maxDuration = 300;

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

    // after() tells Vercel to keep the function alive until processAsync completes,
    // even though the HTTP response is returned immediately.
    after(() => processAsync(image, payload.userId).catch((err) =>
      console.error('Background process error:', err)
    ));

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

      // If the user has the social add-on enabled and listing details are complete,
      // create a draft social post so they see the "Review & Post" prompt.
      // Only one draft per folder — skip if one already exists.
      await maybeCreateDraftPost(image.id, userId).catch((err: Error) =>
        console.warn('Draft post creation skipped:', err.message)
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

// Creates a draft social_posts row when all preconditions are met:
//   1. User has social_media_addon enabled
//   2. Listing details for the VIN folder are complete (price + condition + year/make/model)
//   3. No pending draft already exists for this folder
async function maybeCreateDraftPost(imageId: number, userId: number): Promise<void> {
  const userResult = await query(
    `SELECT social_media_addon, caption_template, vin_search_url_template
     FROM users WHERE id = $1`,
    [userId]
  );
  const user = userResult.rows[0];
  if (!user?.social_media_addon) return;

  const folderResult = await query(
    `SELECT vf.id, vf.vin_name, vf.price, vf.condition, vf.description, vf.vin_details
     FROM images i
     JOIN vin_folders vf ON i.vin_folder_id = vf.id
     WHERE i.id = $1`,
    [imageId]
  );
  if (folderResult.rows.length === 0) return;
  const folder = folderResult.rows[0];

  if (!isListingComplete({
    price: folder.price ? Number(folder.price) : null,
    condition: folder.condition,
    vin_details: folder.vin_details,
  })) return;

  // One draft per folder — skip if one already exists
  const existing = await query(
    `SELECT id FROM social_posts
     WHERE vin_folder_id = $1 AND platform = 'facebook' AND status = 'draft'`,
    [folder.id]
  );
  if (existing.rows.length > 0) return;

  const caption = buildCaption(user.caption_template, {
    price: folder.price ? Number(folder.price) : null,
    condition: folder.condition,
    description: folder.description,
    vin_details: folder.vin_details,
  });
  const firstComment = buildListingUrl(user.vin_search_url_template, folder.vin_name);

  await query(
    `INSERT INTO social_posts
       (vin_folder_id, user_id, platform, hero_image_id, caption, first_comment, status)
     VALUES ($1, $2, 'facebook', $3, $4, $5, 'draft')`,
    [folder.id, userId, imageId, caption, firstComment]
  );
}
