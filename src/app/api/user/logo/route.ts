import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken, getTokenFromRequest } from '@/lib/auth';
import { getStorage, logoKey } from '@/lib/storage';

export async function GET(req: NextRequest) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const result = await query('SELECT logo_path FROM users WHERE id = $1', [payload.userId]);
    const logoPath = result.rows[0]?.logo_path ?? null;

    if (!logoPath) {
      return NextResponse.json({ success: true, logo: null });
    }

    const url = await getStorage().getSignedUrl(logoPath, 120);
    return NextResponse.json({ success: true, logo: { url, path: logoPath } });
  } catch (error) {
    console.error('Get logo error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get('logo') as File | null;

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    if (!['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'].includes(file.type)) {
      return NextResponse.json({ error: 'Logo must be JPEG, PNG, WebP, or SVG' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const key = logoKey(payload.userId, file.name);

    const storage = getStorage();

    // Delete existing logo if present
    const existing = await query('SELECT logo_path FROM users WHERE id = $1', [payload.userId]);
    if (existing.rows[0]?.logo_path) {
      await storage.delete(existing.rows[0].logo_path).catch(() => {});
    }

    await storage.upload(key, buffer, file.type);
    await query('UPDATE users SET logo_path = $1 WHERE id = $2', [key, payload.userId]);

    const url = await storage.getSignedUrl(key, 120);
    return NextResponse.json({ success: true, logo: { url, path: key } });
  } catch (error) {
    console.error('Upload logo error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const result = await query('SELECT logo_path FROM users WHERE id = $1', [payload.userId]);
    const logoPath = result.rows[0]?.logo_path;

    if (logoPath) {
      await getStorage().delete(logoPath).catch(() => {});
      await query('UPDATE users SET logo_path = NULL WHERE id = $1', [payload.userId]);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete logo error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
