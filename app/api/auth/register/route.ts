import { NextRequest, NextResponse } from 'next/server';
import { getUserByEmail, setUser, setEmailIndex, getUser, type UserStore } from '@/lib/redis';
import { createToken, makeSessionCookie } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { email, password, username } = await req.json();

    if (!email || !password || !username) {
      return NextResponse.json({ error: 'All fields required' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    // Check if email already exists
    const existing = await getUserByEmail(email.toLowerCase());
    if (existing) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
    }

    // Create user
    const userId = `u_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const user: UserStore = {
      userId,
      username,
      email: email.toLowerCase(),
      passwordHash: password, // In production, use bcrypt
      subscribed: false,
      addedAt: new Date().toISOString(),
      subscription: {
        plan: 'free',
        status: 'inactive',
      },
    };

    await setUser(userId, user);
    await setEmailIndex(email.toLowerCase(), userId);

    // Create token
    const token = createToken(userId);

    return NextResponse.json(
      { success: true, userId },
      {
        headers: {
          'Set-Cookie': makeSessionCookie(token),
        },
      }
    );
  } catch (err: any) {
    console.error('Register error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
