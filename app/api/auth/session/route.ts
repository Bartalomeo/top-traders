import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, parseCookies } from '@/lib/auth';
import { getUser } from '@/lib/redis';

export async function GET(req: NextRequest) {
  try {
    const cookieHeader = req.headers.get('cookie') || '';
    const cookies = parseCookies(cookieHeader);
    const token = cookies['tt_session'];

    if (!token) {
      return NextResponse.json({});
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({});
    }

    const user = await getUser(payload.userId);
    if (!user) {
      return NextResponse.json({});
    }

    return NextResponse.json({
      userId: user.userId,
      username: user.username,
      email: user.email,
      subscribed: user.subscribed,
      subscription: user.subscription,
    });
  } catch {
    return NextResponse.json({});
  }
}
