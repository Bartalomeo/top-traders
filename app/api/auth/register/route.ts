import { NextRequest, NextResponse } from 'next/server';
import { getUserByEmail, setUser, setEmailIndex, type UserStore } from '@/lib/redis';
import { createToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { email, password, username } = await req.json();

    if (!email || !password || !username) {
      return NextResponse.json({ error: 'All fields required' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    const existing = await getUserByEmail(email.toLowerCase());
    if (existing) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
    }

    const userId = `u_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const user: UserStore = {
      userId,
      username,
      email: email.toLowerCase(),
      passwordHash: password,
      subscribed: false,
      addedAt: new Date().toISOString(),
      subscription: {
        plan: 'free',
        status: 'inactive',
      },
    };

    await setUser(userId, user);
    await setEmailIndex(email.toLowerCase(), userId);

    const token = createToken(userId);

    const response = NextResponse.json({ success: true, userId });
    response.cookies.set('tt_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });
    return response;
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
