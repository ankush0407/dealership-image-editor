import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { query } from '@/lib/db';
import { verifyToken, getTokenFromRequest } from '@/lib/auth';
import { getStorage, socialKey } from '@/lib/storage';
import { buildCaption, buildListingUrl } from '@/lib/social';
import { createZernioPost } from '@/lib/zernio';

export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const { id } = await params;

    // Load the failed post + its folder + user settings in one shot
    const postResult = await query(
      `SELECT sp.id, sp.vin_folder_id, sp.hero_image_id, sp.caption,
              sp.first_comment, sp.scheduled_at, sp.status,
              vf.vin_name, vf.price, vf.condition, vf.description, vf.vin_details,
              u.zernio_fb_account_id, u.caption_template, u.vin_search_url_template,
              u.social_media_addon
       FROM social_posts sp
       JOIN vin_folders vf ON sp.vin_folder_id = vf.id
       JOIN users u ON sp.user_id = u.id
       WHERE sp.id = $1 AND sp.user_id = $2`,
      [id, payload.userId]
    );
    if (postResult.rows.length === 0) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }
    const post = postResult.rows[0];

    if (!post.social_media_addon) {
      return NextResponse.json({ error: 'Social media add-on not enabled' }, { status: 403 });
    }
    if (post.status !== 'failed') {
      return NextResponse.json({ error: 'Only failed posts can be retried' }, { status: 400 });
    }
    if (!post.zernio_fb_account_id) {
      return NextResponse.json({ error: 'Facebook page not connected' }, { status: 400 });
    }

    // Load hero image
    const imageResult = await query(
      `SELECT edited_path FROM images WHERE id = $1 AND status = 'done'`,
      [post.hero_image_id]
    );
    if (imageResult.rows.length === 0) {
      return NextResponse.json({ error: 'Hero image not available' }, { status: 404 });
    }

    // Re-resize and re-upload (original resized copy was deleted after failure)
    const storage = getStorage();
    const rawBuffer = await storage.download(imageResult.rows[0].edited_path);
    const resizedBuffer = await sharp(rawBuffer)
      .resize(1200, 1200, {
        fit: 'contain',
        background: { r: 66, g: 66, b: 66 },
      })
      .jpeg({ quality: 92 })
      .toBuffer();

    const resizedKey = socialKey(payload.userId, post.vin_name, `${post.hero_image_id}-resized.jpg`);
    await storage.upload(resizedKey, resizedBuffer, 'image/jpeg');
    const signedUrl = await storage.getSignedUrl(resizedKey, 900);

    const caption = post.caption ?? buildCaption(post.caption_template, {
      price: post.price ? Number(post.price) : null,
      condition: post.condition,
      description: post.description,
      vin_details: post.vin_details,
    });
    const firstComment = post.first_comment ?? buildListingUrl(post.vin_search_url_template, post.vin_name);

    // Mark as retrying
    await query(`UPDATE social_posts SET status = 'scheduled', error_message = NULL WHERE id = $1`, [id]);

    try {
      const result = await createZernioPost({
        accountId: post.zernio_fb_account_id,
        imageUrl: signedUrl,
        caption,
        firstComment,
        scheduledAt: post.scheduled_at ? new Date(post.scheduled_at).toISOString() : undefined,
      });
      await query(`UPDATE social_posts SET zernio_post_id = $1 WHERE id = $2`, [result.zernioPostId, id]);
    } catch (zernioErr: any) {
      await query(
        `UPDATE social_posts SET status = 'failed', error_message = $1 WHERE id = $2`,
        [zernioErr.message, id]
      );
      await storage.delete(resizedKey).catch(() => {});
      return NextResponse.json({ error: `Zernio error: ${zernioErr.message}` }, { status: 502 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
