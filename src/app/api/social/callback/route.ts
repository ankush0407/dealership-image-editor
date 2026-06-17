import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { exchangeZernioCode } from '@/lib/zernio';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

// Zernio redirects here after the user connects their Facebook Page.
// ?code=...&state=<jwt>
export async function GET(req: NextRequest) {
  const code  = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state'); // our JWT
  const error = req.nextUrl.searchParams.get('error');

  if (error) {
    return NextResponse.redirect(`${APP_URL}/dashboard?social_error=${encodeURIComponent(error)}`);
  }
  if (!code || !state) {
    return NextResponse.redirect(`${APP_URL}/dashboard?social_error=missing_params`);
  }

  const payload = verifyToken(state);
  if (!payload) {
    return NextResponse.redirect(`${APP_URL}/dashboard?social_error=invalid_state`);
  }

  try {
    const { accountId, pageName } = await exchangeZernioCode(code);
    await query(
      `UPDATE users
       SET zernio_fb_account_id = $1, fb_page_name = $2
       WHERE id = $3`,
      [accountId, pageName, payload.userId]
    );
    return NextResponse.redirect(`${APP_URL}/dashboard?social_connected=1`);
  } catch (err: any) {
    return NextResponse.redirect(
      `${APP_URL}/dashboard?social_error=${encodeURIComponent(err.message)}`
    );
  }
}
