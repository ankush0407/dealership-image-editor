import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { query } from '@/lib/db';
import { verifyToken, getTokenFromRequest } from '@/lib/auth';

const ZERNIO_API_KEY = process.env.ZERNIO_API_KEY ?? '';
const ZERNIO_BASE    = 'https://api.zernio.com';

// POST — save the user's Zernio account_id for their Facebook Page.
// The user gets this account_id from their Zernio dashboard after connecting their FB Page there.
// Body: { account_id: string, page_name?: string }
export async function POST(req: NextRequest) {
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
      return NextResponse.json({ error: 'Social media add-on not enabled' }, { status: 403 });
    }

    const body = await req.json();
    const { account_id, page_name } = body;
    if (!account_id || typeof account_id !== 'string' || !account_id.trim()) {
      return NextResponse.json({ error: 'account_id is required' }, { status: 400 });
    }

    // Verify the account_id is valid by calling Zernio's accounts endpoint
    if (ZERNIO_API_KEY && ZERNIO_API_KEY !== 'placeholder') {
      try {
        await axios.get(`${ZERNIO_BASE}/accounts/${account_id.trim()}`, {
          headers: { Authorization: `Bearer ${ZERNIO_API_KEY}` },
          timeout: 10000,
        });
      } catch {
        return NextResponse.json(
          { error: 'Could not verify account_id with Zernio. Make sure you copied it correctly.' },
          { status: 400 }
        );
      }
    }

    await query(
      `UPDATE users SET zernio_fb_account_id = $1, fb_page_name = $2 WHERE id = $3`,
      [account_id.trim(), page_name?.trim() ?? account_id.trim(), payload.userId]
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
