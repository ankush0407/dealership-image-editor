import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken, getTokenFromRequest } from '@/lib/auth';

export async function POST(req: NextRequest) {
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

    const body = await req.json();
    const { vin_name } = body;

    if (!vin_name) {
      return NextResponse.json(
        { error: 'Missing vin_name' },
        { status: 400 }
      );
    }

    const result = await query(
      'INSERT INTO vin_folders (user_id, vin_name) VALUES ($1, $2) RETURNING id, vin_name, created_at',
      [payload.userId, vin_name]
    );

    const folder = result.rows[0];

    return NextResponse.json({
      success: true,
      folder: {
        id: folder.id,
        vin_name: folder.vin_name,
        created_at: folder.created_at,
      },
    });
  } catch (error) {
    console.error('VIN folder creation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
