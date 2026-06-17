import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken, getTokenFromRequest } from '@/lib/auth';
import { getStorage } from '@/lib/storage';

// Returns 2-minute signed URLs for all edited images in a VIN folder.
// The browser fetches each URL directly from Supabase and bundles them into a ZIP.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const { id } = await params;

    const folderResult = await query(
      'SELECT id, vin_name FROM vin_folders WHERE id = $1 AND user_id = $2',
      [id, payload.userId]
    );
    if (folderResult.rows.length === 0) {
      return NextResponse.json({ error: 'VIN folder not found' }, { status: 404 });
    }
    const { vin_name } = folderResult.rows[0];

    const imagesResult = await query(
      "SELECT id, original_filename, edited_path FROM images WHERE vin_folder_id = $1 AND status = 'done' AND edited_path IS NOT NULL ORDER BY id",
      [id]
    );

    const storage = getStorage();

    // Count occurrences of each base filename to detect duplicates
    const baseNames = imagesResult.rows.map((img) => `edited_${img.original_filename}`);
    const nameCount = baseNames.reduce<Record<string, number>>((acc, n) => {
      acc[n] = (acc[n] || 0) + 1;
      return acc;
    }, {});
    const nameCounter: Record<string, number> = {};

    const items = await Promise.all(
      imagesResult.rows.map(async (img, i) => {
        const base = baseNames[i];
        let filename = base;
        if (nameCount[base] > 1) {
          nameCounter[base] = (nameCounter[base] || 0) + 1;
          const dot = base.lastIndexOf('.');
          filename =
            dot >= 0
              ? `${base.slice(0, dot)} (${nameCounter[base]})${base.slice(dot)}`
              : `${base} (${nameCounter[base]})`;
        }
        const url = await storage.getSignedUrl(img.edited_path, 120);
        return { id: img.id, filename, url };
      })
    );

    return NextResponse.json({ success: true, vinName: vin_name, items });
  } catch (error: any) {
    console.error('download-urls error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
