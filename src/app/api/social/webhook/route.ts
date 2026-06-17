import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getStorage, socialKey } from '@/lib/storage';

// Zernio calls this endpoint when a post is delivered or fails.
// TODO: once you have Zernio docs, add webhook signature verification here.
// Expected payload shape (verify against Zernio docs):
// { post_id: string, status: 'published' | 'failed', platform_post_id?: string,
//   platform_post_url?: string, error?: string }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { post_id: zernioPostId, status, platform_post_id, platform_post_url, error } = body;

    if (!zernioPostId || !status) {
      return NextResponse.json({ error: 'Missing post_id or status' }, { status: 400 });
    }

    const postResult = await query(
      `SELECT sp.id, sp.user_id, sp.hero_image_id, vf.vin_name
       FROM social_posts sp
       JOIN vin_folders vf ON sp.vin_folder_id = vf.id
       WHERE sp.zernio_post_id = $1`,
      [zernioPostId]
    );
    if (postResult.rows.length === 0) {
      // Unknown post — return 200 to stop Zernio retrying
      return NextResponse.json({ ok: true });
    }
    const post = postResult.rows[0];

    if (status === 'published') {
      await query(
        `UPDATE social_posts
         SET status = 'posted',
             platform_post_id = $1,
             platform_post_url = $2,
             posted_at = NOW(),
             error_message = NULL
         WHERE id = $3`,
        [platform_post_id ?? null, platform_post_url ?? null, post.id]
      );

      // Delete the resized image from Supabase — no longer needed
      const storage = getStorage();
      const resizedKey = socialKey(post.user_id, post.vin_name, `${post.hero_image_id}-resized.jpg`);
      await storage.delete(resizedKey).catch(() => {});

    } else if (status === 'failed') {
      await query(
        `UPDATE social_posts SET status = 'failed', error_message = $1 WHERE id = $2`,
        [error ?? 'Zernio delivery failed', post.id]
      );

      // Also clean up the resized image on failure
      const storage = getStorage();
      const resizedKey = socialKey(post.user_id, post.vin_name, `${post.hero_image_id}-resized.jpg`);
      await storage.delete(resizedKey).catch(() => {});
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Social webhook error:', err);
    // Return 200 to prevent Zernio from retrying indefinitely
    return NextResponse.json({ ok: true });
  }
}
