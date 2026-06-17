import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken, getTokenFromRequest } from '@/lib/auth';
import { getZernioOAuthUrl } from '@/lib/zernio';

// Starts the Zernio OAuth flow.
// The user's JWT is forwarded as a `state` param so the callback can identify them.
export async function GET(req: NextRequest) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const addonCheck = await query(
      'SELECT social_media_addon FROM users WHERE id = $1',
      [payload.userId]
    );
    if (!addonCheck.rows[0]?.social_media_addon) {
      return NextResponse.json(
        { error: 'Social media add-on not enabled for this account' },
        { status: 403 }
      );
    }

    const oauthUrl = new URL(getZernioOAuthUrl());
    oauthUrl.searchParams.set('state', token);
    return NextResponse.redirect(oauthUrl.toString());
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
