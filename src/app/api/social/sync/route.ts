import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken, getTokenFromRequest } from '@/lib/auth';
import { listZernioAccounts } from '@/lib/zernio';

// GET — checks Zernio for connected Facebook accounts and saves the account_id.
// Called by the frontend after the user completes OAuth on Zernio's page.
export async function GET(req: NextRequest) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const userResult = await query(
      'SELECT zernio_profile_id, zernio_fb_account_id FROM users WHERE id = $1',
      [payload.userId]
    );
    const user = userResult.rows[0];
    if (!user?.zernio_profile_id) {
      return NextResponse.json({ connected: false, reason: 'No Zernio profile yet' });
    }

    // Try filtered list first; fall back to full list if profileId param isn't supported
    let accounts = await listZernioAccounts(user.zernio_profile_id);
    if (accounts.length === 0) {
      accounts = await listZernioAccounts(); // unfiltered fallback
    }

    const fbAccount = accounts.find(
      (a) => a.platform === 'facebook' && a._id !== user.zernio_fb_account_id
    );

    if (fbAccount) {
      await query(
        'UPDATE users SET zernio_fb_account_id = $1, fb_page_name = $2 WHERE id = $3',
        [fbAccount._id, fbAccount.name ?? fbAccount._id, payload.userId]
      );
      return NextResponse.json({
        connected: true,
        account_id: fbAccount._id,
        page_name: fbAccount.name ?? fbAccount._id,
      });
    }

    // Already connected from before
    if (user.zernio_fb_account_id) {
      return NextResponse.json({ connected: true, account_id: user.zernio_fb_account_id });
    }

    return NextResponse.json({ connected: false });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
