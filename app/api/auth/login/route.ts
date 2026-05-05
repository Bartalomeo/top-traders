import { NextRequest, NextResponse } from 'next/server';
import { getUserByEmail, setUser, type UserStore } from '@/lib/redis';
import { createToken, makeSessionCookie, verifyPassword, migratePasswordIfNeeded } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
    }

    // Find user
    const user = await getUserByEmail(email.toLowerCase());
    if (!user) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // Verify password with bcrypt
    if (!user.passwordHash) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // Migrate plaintext to bcrypt if needed
    if (!user.passwordHash.startsWith('$2')) {
      user.passwordHash = await migratePasswordIfNeeded(user, password);
      await setUser(user.userId, user);
    }

    // Create token
    const token = createToken(user.userId);

    return NextResponse.json(
      { success: true, userId: user.userId },
      {
        headers: {
          'Set-Cookie': makeSessionCookie(token),
        },
      }
    );
  } catch (err: any) {
    console.error('Login error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
