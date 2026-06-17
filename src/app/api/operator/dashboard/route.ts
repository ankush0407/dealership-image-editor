import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

const OPERATOR_SECRET = process.env.OPERATOR_SECRET || '';

function isAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  return !!authHeader && authHeader === `Bearer ${OPERATOR_SECRET}`;
}

export async function GET(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all users with their stats
    const usersResult = await query(`
      SELECT 
        u.id,
        u.email,
        u.plan,
        u.credits_remaining,
        COUNT(DISTINCT vi.id) as total_images,
        COUNT(DISTINCT CASE WHEN vi.status = 'done' THEN vi.id END) as processed_images,
        COUNT(DISTINCT CASE WHEN vi.status = 'failed' THEN vi.id END) as failed_images,
        u.created_at
      FROM users u
      LEFT JOIN images vi ON u.id = vi.user_id
      GROUP BY u.id, u.email, u.plan, u.credits_remaining, u.created_at
      ORDER BY u.created_at DESC
    `);

    // Get credit summary
    const creditResult = await query(`
      SELECT 
        ct.user_id,
        SUM(CASE WHEN ct.reason = 'image_processing' THEN -ct.delta ELSE 0 END) as credits_used,
        COUNT(*) as transaction_count
      FROM credit_transactions ct
      GROUP BY ct.user_id
    `);

    const creditMap = new Map<number, { credits_used: number; transaction_count: number }>(
      creditResult.rows.map((row: any) => [row.user_id, row])
    );

    const users = usersResult.rows.map((user: any) => {
      const credit = creditMap.get(user.id);
      return {
        ...user,
        credits_used: credit?.credits_used || 0,
        transaction_count: credit?.transaction_count || 0,
      };
    });

    // Get platform statistics
    const statsResult = await query(`
      SELECT
        COUNT(DISTINCT user_id) as total_users,
        COUNT(*) as total_images,
        COUNT(CASE WHEN status = 'done' THEN 1 END) as successful_images,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_images,
        ROUND(100.0 * COUNT(CASE WHEN status = 'failed' THEN 1 END) / COUNT(*), 2) as error_rate
      FROM images
    `);

    const stats = statsResult.rows[0];

    return NextResponse.json({
      success: true,
      stats,
      users,
    });
  } catch (error) {
    console.error('Operator dashboard error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH /api/operator/dashboard
// Toggle per-user settings. Currently supports: social_media_addon, credits_remaining, plan.
// Body: { user_id: number, social_media_addon?: boolean, credits_remaining?: number, plan?: string }
export async function PATCH(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { user_id, social_media_addon, credits_remaining, plan } = body;

    if (!user_id) {
      return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });
    }

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (typeof social_media_addon === 'boolean') {
      setClauses.push(`social_media_addon = $${idx++}`);
      values.push(social_media_addon);
    }
    if (typeof credits_remaining === 'number') {
      setClauses.push(`credits_remaining = $${idx++}`);
      values.push(credits_remaining);
    }
    if (typeof plan === 'string') {
      setClauses.push(`plan = $${idx++}`);
      values.push(plan);
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    values.push(user_id);
    await query(
      `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${idx}`,
      values
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Operator PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
