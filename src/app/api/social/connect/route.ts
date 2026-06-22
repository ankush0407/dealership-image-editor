import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken, getTokenFromRequest } from '@/lib/auth';
import { createZernioProfile, getZernioConnectUrl } from '@/lib/zernio';

// GET — returns { authUrl } for the frontend to open in a new tab.
// Creates a Zernio profile for the user the first time they connect.
export async function GET(req: NextRequest) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const userResult = await query(
      'SELECT social_media_addon, zernio_profile_id, email FROM users WHERE id = $1',
      [payload.userId]
    );
    const user = userResult.rows[0];
    if (!user?.social_media_addon) {
      return NextResponse.json({ error: 'Social media add-on not enabled' }, { status: 403 });
    }

    // Create a Zernio profile for this user if they don't have one yet
    let profileId: string = user.zernio_profile_id;
    if (!profileId) {
      profileId = await createZernioProfile(user.email);
      await query('UPDATE users SET zernio_profile_id = $1 WHERE id = $2', [profileId, payload.userId]);
    }

    const authUrl = await getZernioConnectUrl('facebook', profileId);
    return NextResponse.json({ success: true, authUrl });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
