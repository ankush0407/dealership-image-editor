import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken, getTokenFromRequest } from '@/lib/auth';
import { getStorage, storageKey } from '@/lib/storage';

// Returns a Supabase signed upload URL so the browser can PUT the file
// directly to Supabase, bypassing Vercel's 4.5 MB request body limit.
export async function POST(req: NextRequest) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const body = await req.json();
    const { vin_folder_id, filename, content_type } = body;

    if (!vin_folder_id || !filename || !content_type) {
      return NextResponse.json({ error: 'Missing vin_folder_id, filename, or content_type' }, { status: 400 });
    }

    if (!['image/jpeg', 'image/png'].includes(content_type)) {
      return NextResponse.json({ error: 'Only JPEG and PNG files are supported' }, { status: 400 });
    }

    const folderResult = await query(
      'SELECT id, vin_name FROM vin_folders WHERE id = $1 AND user_id = $2',
      [vin_folder_id, payload.userId]
    );
    if (folderResult.rows.length === 0) {
      return NextResponse.json({ error: 'VIN folder not found' }, { status: 404 });
    }
    const { vin_name } = folderResult.rows[0];

    const userResult = await query('SELECT credits_remaining FROM users WHERE id = $1', [payload.userId]);
    if (userResult.rows[0].credits_remaining < 1) {
      return NextResponse.json({ error: 'Insufficient credits' }, { status: 400 });
    }

    const rawKey = storageKey(payload.userId, vin_name, 'raw', filename);

    // Surface the real Supabase error so it shows in the UI
    let signedUrl: string;
    try {
      signedUrl = await getStorage().getSignedUploadUrl(rawKey);
    } catch (storageErr: any) {
      console.error('getSignedUploadUrl failed:', storageErr);
      return NextResponse.json({ error: `Storage: ${storageErr.message}` }, { status: 500 });
    }

    const imageResult = await query(
      'INSERT INTO images (vin_folder_id, user_id, original_filename, raw_path, status) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [vin_folder_id, payload.userId, filename, rawKey, 'queued']
    );
    const imageId = imageResult.rows[0].id;

    await query('UPDATE users SET credits_remaining = credits_remaining - 1 WHERE id = $1', [payload.userId]);
    await query(
      'INSERT INTO credit_transactions (user_id, delta, reason, image_id) VALUES ($1, $2, $3, $4)',
      [payload.userId, -1, 'image_processing', imageId]
    );

    return NextResponse.json({ success: true, imageId, signedUrl, storageKey: rawKey });
  } catch (error: any) {
    console.error('Upload URL error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
