import { NextRequest, NextResponse } from 'next/server';
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

    // Get all images in the VIN folder
    const result = await query(
      `SELECT id, original_filename, status, raw_path, edited_path, created_at, processed_at, error_message
       FROM images
       WHERE vin_folder_id = $1 AND user_id = $2
       ORDER BY created_at DESC`,
      [id, payload.userId]
    );

    if (result.rows.length === 0) {
      // Verify folder exists and belongs to user
      const folderResult = await query(
        'SELECT id FROM vin_folders WHERE id = $1 AND user_id = $2',
        [id, payload.userId]
      );

      if (folderResult.rows.length === 0) {
        return NextResponse.json(
          { error: 'VIN folder not found' },
          { status: 404 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      images: result.rows,
    });
  } catch (error) {
    console.error('List images error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
