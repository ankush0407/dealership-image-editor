import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken, getTokenFromRequest } from '@/lib/auth';
import { getStorage } from '@/lib/storage';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const type = req.nextUrl.searchParams.get('type') === 'raw' ? 'raw' : 'edited';

    const token = getTokenFromRequest(req);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const result = await query(
      'SELECT id, user_id, raw_path, edited_path, status FROM images WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    const image = result.rows[0];

    if (image.user_id !== payload.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    if (type === 'edited' && image.status !== 'done') {
      return NextResponse.json({ error: 'Image not ready' }, { status: 400 });
    }

    const key = type === 'raw' ? image.raw_path : image.edited_path;
    const url = await getStorage().getSignedUrl(key, 120);

    return NextResponse.json({ url });
  } catch (error) {
    console.error('Preview URL error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
