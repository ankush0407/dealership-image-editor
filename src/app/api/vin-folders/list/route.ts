import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken, getTokenFromRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
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

    const result = await query(
      'SELECT id, vin_name, created_at FROM vin_folders WHERE user_id = $1 ORDER BY created_at DESC',
      [payload.userId]
    );

    const folders = result.rows;

    // Get image counts for each folder
    const foldersWithCounts = await Promise.all(
      folders.map(async (folder: { id: number; vin_name: string; created_at: string }) => {
        const countResult = await query(
          'SELECT COUNT(*) as total, COUNT(CASE WHEN status = $1 THEN 1 END) as processed FROM images WHERE vin_folder_id = $2',
          ['done', folder.id]
        );
        return {
          ...folder,
          total_images: parseInt(countResult.rows[0].total),
          processed_images: parseInt(countResult.rows[0].processed),
        };
      })
    );

    return NextResponse.json({
      success: true,
      folders: foldersWithCounts,
    });
  } catch (error) {
    console.error('List VIN folders error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
