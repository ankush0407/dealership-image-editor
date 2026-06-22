import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken, getTokenFromRequest } from '@/lib/auth';
import { DEFAULT_TEMPLATE } from '@/lib/social';

export async function GET(req: NextRequest) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const result = await query(
      `SELECT social_media_addon, zernio_fb_account_id, fb_page_name,
              vin_search_url_template, caption_template
       FROM users WHERE id = $1`,
      [payload.userId]
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const u = result.rows[0];
    return NextResponse.json({
      success: true,
      addon_enabled: u.social_media_addon,
      fb_connected: !!u.zernio_fb_account_id,
      fb_page_name: u.fb_page_name ?? null,
      vin_search_url_template: u.vin_search_url_template ?? '',
      caption_template: u.caption_template ?? DEFAULT_TEMPLATE,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
