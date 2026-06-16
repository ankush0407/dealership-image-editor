import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { query } from '@/lib/db';
import { verifyToken, getTokenFromRequest } from '@/lib/auth';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const token = getTokenFromRequest(req);
    if (!token) {
      return NextResponse.json(
        { error: 'Missing or invalid authorization header' },
        { status: 401 }
      );
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }

    const type = req.nextUrl.searchParams.get('type') === 'raw' ? 'raw' : 'edited';
    const inline = req.nextUrl.searchParams.get('inline') === 'true';

    // Get image record
    const result = await query(
      `SELECT id, user_id, original_filename, raw_path, edited_path, status
       FROM images
       WHERE id = $1`,
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
      return NextResponse.json({ error: 'Image is not ready for download' }, { status: 400 });
    }

    const filePath = type === 'raw' ? image.raw_path : image.edited_path;
    const fileBuffer = await readFile(filePath);

    const mimeType = image.original_filename.toLowerCase().endsWith('.png')
      ? 'image/png'
      : 'image/jpeg';

    const filename = type === 'raw' ? image.original_filename : `edited_${image.original_filename}`;

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': inline
          ? `inline; filename="${filename}"`
          : `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Download image error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
