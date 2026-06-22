import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken, getTokenFromRequest } from '@/lib/auth';
import { isListingComplete } from '@/lib/social';

type Params = { params: Promise<{ id: string }> };

// GET — return current listing details for a VIN folder
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const { id } = await params;
    const result = await query(
      'SELECT id, vin_name, price, condition, description, vin_details FROM vin_folders WHERE id = $1 AND user_id = $2',
      [id, payload.userId]
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'VIN folder not found' }, { status: 404 });
    }

    const folder = result.rows[0];
    return NextResponse.json({
      success: true,
      listing: {
        vin_name: folder.vin_name,
        price: folder.price ? Number(folder.price) : null,
        condition: folder.condition,
        description: folder.description,
        vin_details: folder.vin_details ?? {},
        complete: isListingComplete({
          price: folder.price ? Number(folder.price) : null,
          condition: folder.condition,
          vin_details: folder.vin_details,
        }),
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT — save listing details (partial updates OK — only provided fields are changed)
export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const { id } = await params;
    const body = await req.json();

    // Verify ownership
    const ownership = await query(
      'SELECT id FROM vin_folders WHERE id = $1 AND user_id = $2',
      [id, payload.userId]
    );
    if (ownership.rows.length === 0) {
      return NextResponse.json({ error: 'VIN folder not found' }, { status: 404 });
    }

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if ('price' in body) {
      setClauses.push(`price = $${idx++}`);
      values.push(body.price ?? null);
    }
    if ('condition' in body) {
      setClauses.push(`condition = $${idx++}`);
      values.push(body.condition ?? null);
    }
    if ('description' in body) {
      setClauses.push(`description = $${idx++}`);
      values.push(body.description ?? null);
    }
    // vin_details: merge with existing rather than replace — callers send only changed keys
    if ('vin_details' in body && body.vin_details && typeof body.vin_details === 'object') {
      setClauses.push(`vin_details = COALESCE(vin_details, '{}'::jsonb) || $${idx++}::jsonb`);
      values.push(JSON.stringify(body.vin_details));
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    values.push(id);
    await query(
      `UPDATE vin_folders SET ${setClauses.join(', ')} WHERE id = $${idx}`,
      values
    );

    // Return the updated listing so the client can re-check completeness
    const updated = await query(
      'SELECT price, condition, description, vin_details FROM vin_folders WHERE id = $1',
      [id]
    );
    const f = updated.rows[0];
    return NextResponse.json({
      success: true,
      listing: {
        price: f.price ? Number(f.price) : null,
        condition: f.condition,
        description: f.description,
        vin_details: f.vin_details ?? {},
        complete: isListingComplete({
          price: f.price ? Number(f.price) : null,
          condition: f.condition,
          vin_details: f.vin_details,
        }),
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
