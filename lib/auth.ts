import jwt from 'jsonwebtoken';
import { getUser, setUser } from '@/lib/redis';

const JWT_SECRET = process.env.JWT_SECRET || 'tt-secret-change-me-in-vercel';
const SESSION_DURATION = 7 * 24 * 60 * 60; // 7 days

export interface SessionPayload {
  userId: string;
  iat: number;
  exp: number;
}

export function createToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: SESSION_DURATION });
}

export function verifyToken(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as SessionPayload;
  } catch {
    return null;
  }
}

export function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach(c => {
    const [k, ...v] = c.trim().split('=');
    if (k) cookies[k] = v.join('=');
  });
  return cookies;
}

export function makeSessionCookie(token: string): string {
  return `tt_session=${token}; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DURATION}; Path=/`;
}

export function clearSessionCookie(): string {
  return 'tt_session=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/';
}

export async function getSessionFromRequest(request: Request) {
  const cookieHeader = request.headers.get('cookie') || '';
  const cookies = parseCookies(cookieHeader);
  const token = cookies['tt_session'];
  if (!token) return null;

  const payload = verifyToken(token);
  if (!payload) return null;

  const user = await getUser(payload.userId);
  if (!user) return null;

  // Check subscription expiry
  if (user.subscription.status === 'active' && user.subscription.currentPeriodEnd) {
    if (new Date(user.subscription.currentPeriodEnd) < new Date()) {
      user.subscription = { plan: 'free', status: 'inactive' };
      user.subscribed = false;
      await setUser(payload.userId, user);
    }
  }

  return { user, token };
}
