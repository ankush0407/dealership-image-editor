import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken, getTokenFromRequest } from '@/lib/auth';

type Params = { params: Promise<{ id: string }> };

// GET — return all social posts for a VIN folder, newest first
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const { id } = await params;

    // Verify folder ownership
    const ownership = await query(
      'SELECT id FROM vin_folders WHERE id = $1 AND user_id = $2',
      [id, payload.userId]
    );
    if (ownership.rows.length === 0) {
      return NextResponse.json({ error: 'VIN folder not found' }, { status: 404 });
    }

    const result = await query(
      `SELECT id, platform, status, hero_image_id, caption, first_comment,
              scheduled_at, posted_at, platform_post_url, error_message, created_at
       FROM social_posts
       WHERE vin_folder_id = $1
       ORDER BY created_at DESC`,
      [id]
    );

    return NextResponse.json({ success: true, posts: result.rows });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
