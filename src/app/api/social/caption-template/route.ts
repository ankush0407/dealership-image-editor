import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken, getTokenFromRequest } from '@/lib/auth';

// PUT — save per-user caption template and/or VIN search URL template
export async function PUT(req: NextRequest) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const body = await req.json();
    const { caption_template, vin_search_url_template } = body;

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if ('caption_template' in body) {
      setClauses.push(`caption_template = $${idx++}`);
      values.push(caption_template ?? null);
    }
    if ('vin_search_url_template' in body) {
      setClauses.push(`vin_search_url_template = $${idx++}`);
      values.push(vin_search_url_template ?? null);
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    values.push(payload.userId);
    await query(
      `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${idx}`,
      values
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
