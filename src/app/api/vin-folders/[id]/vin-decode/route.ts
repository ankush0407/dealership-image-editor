import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { query } from '@/lib/db';
import { verifyToken, getTokenFromRequest } from '@/lib/auth';
import { parseNhtsaResults } from '@/lib/social';

type Params = { params: Promise<{ id: string }> };

// GET — decode VIN via NHTSA and cache result in vin_folders.vin_details
// If vin_details already has year+make+model cached, returns the cached value
// without hitting NHTSA again. Pass ?force=1 to re-fetch.
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const { id } = await params;
    const force = req.nextUrl.searchParams.get('force') === '1';

    const folderResult = await query(
      'SELECT id, vin_name, vin_details FROM vin_folders WHERE id = $1 AND user_id = $2',
      [id, payload.userId]
    );
    if (folderResult.rows.length === 0) {
      return NextResponse.json({ error: 'VIN folder not found' }, { status: 404 });
    }

    const folder = folderResult.rows[0];
    const cached = folder.vin_details ?? {};
    const hasCachedDecode = cached.year && cached.make && cached.model;

    let vinDetails = cached;
    let source: 'cache' | 'nhtsa' = 'cache';

    if (!hasCachedDecode || force) {
      source = 'nhtsa';
      try {
        const nhtsaRes = await axios.get(
          `https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${encodeURIComponent(folder.vin_name)}?format=json`,
          { timeout: 10000 }
        );
        const parsed = parseNhtsaResults(nhtsaRes.data?.Results ?? []);
        // Merge parsed fields into existing vin_details (preserves manual overrides)
        vinDetails = { ...parsed, ...cached };

        // Only persist if NHTSA returned at least one useful field
        if (Object.keys(parsed).length > 0) {
          await query(
            `UPDATE vin_folders
             SET vin_details = COALESCE(vin_details, '{}'::jsonb) || $1::jsonb
             WHERE id = $2`,
            [JSON.stringify(parsed), id]
          );
        }
      } catch (nhtsaErr: any) {
        // NHTSA is best-effort — return cached data (possibly empty) with a warning
        return NextResponse.json({
          success: true,
          source: 'nhtsa_failed',
          warning: `NHTSA request failed: ${nhtsaErr.message}. Fill in details manually.`,
          vin_details: cached,
        });
      }
    }

    return NextResponse.json({ success: true, source, vin_details: vinDetails });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
