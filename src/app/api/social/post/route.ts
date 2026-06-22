import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { query } from '@/lib/db';
import { verifyToken, getTokenFromRequest } from '@/lib/auth';
import { getStorage, socialKey } from '@/lib/storage';
import { buildCaption, buildListingUrl } from '@/lib/social';
import { createZernioPost } from '@/lib/zernio';

export const maxDuration = 60;

// POST — resize hero image, upload to Supabase social/ folder, call Zernio, log post
// Body: { vin_folder_id, hero_image_id, caption?, scheduled_at? }
// If caption is omitted it is auto-built from the listing details + user template.
export async function POST(req: NextRequest) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const body = await req.json();
    const { vin_folder_id, hero_image_id, caption: captionOverride, scheduled_at } = body;
    if (!vin_folder_id || !hero_image_id) {
      return NextResponse.json({ error: 'Missing vin_folder_id or hero_image_id' }, { status: 400 });
    }

    // ── 1. Check add-on + FB connection ────────────────────────────────────
    const userResult = await query(
      `SELECT social_media_addon, zernio_fb_account_id,
              caption_template, vin_search_url_template
       FROM users WHERE id = $1`,
      [payload.userId]
    );
    const user = userResult.rows[0];
    if (!user?.social_media_addon) {
      return NextResponse.json({ error: 'Social media add-on not enabled' }, { status: 403 });
    }
    if (!user.zernio_fb_account_id) {
      return NextResponse.json({ error: 'Facebook page not connected' }, { status: 400 });
    }

    // ── 2. Load folder listing details ────────────────────────────────────
    const folderResult = await query(
      `SELECT id, vin_name, price, condition, description, vin_details
       FROM vin_folders WHERE id = $1 AND user_id = $2`,
      [vin_folder_id, payload.userId]
    );
    if (folderResult.rows.length === 0) {
      return NextResponse.json({ error: 'VIN folder not found' }, { status: 404 });
    }
    const folder = folderResult.rows[0];

    // ── 3. Load hero image path ────────────────────────────────────────────
    const imageResult = await query(
      `SELECT id, edited_path, original_filename
       FROM images WHERE id = $1 AND vin_folder_id = $2 AND status = 'done'`,
      [hero_image_id, vin_folder_id]
    );
    if (imageResult.rows.length === 0) {
      return NextResponse.json({ error: 'Hero image not found or not ready' }, { status: 404 });
    }
    const heroImage = imageResult.rows[0];

    // ── 4. Resize hero image to 1200×1200 (FB square) ────────────────────
    const storage = getStorage();
    const rawBuffer = await storage.download(heroImage.edited_path);
    const resizedBuffer = await sharp(rawBuffer)
      .resize(1200, 1200, {
        fit: 'contain',
        background: { r: 66, g: 66, b: 66 }, // #424242 — matches Gemini backdrop
      })
      .jpeg({ quality: 92 })
      .toBuffer();

    // ── 5. Upload resized image to social/ subfolder ──────────────────────
    const resizedKey = socialKey(payload.userId, folder.vin_name, `${heroImage.id}-resized.jpg`);
    await storage.upload(resizedKey, resizedBuffer, 'image/jpeg');

    // ── 6. Generate a signed URL valid for 15 minutes (Zernio fetches it) ─
    const signedUrl = await storage.getSignedUrl(resizedKey, 900);

    // ── 7. Build caption + first comment ─────────────────────────────────
    const caption = captionOverride ?? buildCaption(user.caption_template, {
      price: folder.price ? Number(folder.price) : null,
      condition: folder.condition,
      description: folder.description,
      vin_details: folder.vin_details,
    });
    const firstComment = buildListingUrl(user.vin_search_url_template, folder.vin_name);

    // ── 8. Log the post record ────────────────────────────────────────────
    const isScheduled = !!scheduled_at;
    const insertResult = await query(
      `INSERT INTO social_posts
         (vin_folder_id, user_id, platform, hero_image_id, caption,
          first_comment, scheduled_at, status)
       VALUES ($1, $2, 'facebook', $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        vin_folder_id, payload.userId, hero_image_id, caption,
        firstComment, scheduled_at ?? null,
        isScheduled ? 'scheduled' : 'posted',
      ]
    );
    const postId = insertResult.rows[0].id;

    // ── 9. Call Zernio ─────────────────────────────────────────────────────
    try {
      const zernioPostId = await createZernioPost({
        accountId: user.zernio_fb_account_id,
        imageUrl: signedUrl,
        caption,
        firstComment,
        scheduledAt: scheduled_at ?? undefined,
      });
      await query(
        `UPDATE social_posts SET zernio_post_id = $1, posted_at = CASE WHEN $2 THEN NULL ELSE NOW() END WHERE id = $3`,
        [zernioPostId, isScheduled, postId]
      );
    } catch (zernioErr: any) {
      await query(
        `UPDATE social_posts SET status = 'failed', error_message = $1 WHERE id = $2`,
        [zernioErr.message, postId]
      );
      // Clean up resized image on Zernio failure
      await storage.delete(resizedKey).catch(() => {});
      return NextResponse.json({ error: `Zernio error: ${zernioErr.message}` }, { status: 502 });
    }

    return NextResponse.json({ success: true, post_id: postId });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
