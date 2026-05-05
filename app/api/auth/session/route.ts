import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ userId: null });
    }
    return NextResponse.json({
      userId: session.user.userId,
      username: session.user.username,
      email: session.user.email,
      subscribed: session.user.subscribed,
      subscription: session.user.subscription,
    });
  } catch (err: any) {
    return NextResponse.json({ userId: null });
  }
}
