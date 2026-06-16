import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import { signToken } from '@/lib/auth';

const PLAN_CREDITS = {
  free: 25,
  standard: 250,
  pro: 500,
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, plan } = body;

    if (!email || !password || !plan) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (!['free', 'standard', 'pro'].includes(plan)) {
      return NextResponse.json(
        { error: 'Invalid plan' },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return NextResponse.json(
        { error: 'Email already registered' },
        { status: 400 }
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const credits = PLAN_CREDITS[plan as keyof typeof PLAN_CREDITS];
    const result = await query(
      'INSERT INTO users (email, password_hash, plan, credits_remaining) VALUES ($1, $2, $3, $4) RETURNING id, email, plan, credits_remaining',
      [email, passwordHash, plan, credits]
    );

    const user = result.rows[0];
    const token = signToken({ userId: user.id, email: user.email });

    return NextResponse.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        plan: user.plan,
        credits_remaining: user.credits_remaining,
      },
    });
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
