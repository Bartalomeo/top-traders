import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export { redis };

export interface Subscription {
  plan: 'free' | 'pro';
  status: 'active' | 'inactive' | 'canceled';
  stripeSessionId?: string;
  currentPeriodEnd?: string;
}

export interface UserStore {
  userId: string;
  username?: string;
  passwordHash?: string;
  email?: string;
  subscribed: boolean;
  addedAt: string;
  subscription: Subscription;
}

// KEYS
const userKey = (userId: string) => `tt:user:${userId}`;
const emailIndex = (email: string) => `tt:email:${email}`;
const paymentKey = (ref: string) => `tt:payment:${ref}`;
const traderKey = (address: string) => `tt:trader:${address}`;
const leaderboardKey = () => `tt:leaderboard`;

// --- User ---
export async function getUser(userId: string): Promise<UserStore | null> {
  return redis.get<UserStore>(userKey(userId));
}

export async function setUser(userId: string, user: UserStore): Promise<void> {
  await redis.set(userKey(userId), user, { keepTtl: true });
}

export async function getUserByEmail(email: string): Promise<UserStore | null> {
  const userId = await redis.get<string>(emailIndex(email));
  if (!userId) return null;
  return getUser(userId);
}

export async function setEmailIndex(email: string, userId: string): Promise<void> {
  await redis.set(emailIndex(email), userId, { keepTtl: true });
}

// --- Leaderboard ---
export async function getLeaderboard(limit: number = 10): Promise<string[]> {
  return redis.zrevrange(leaderboardKey(), 0, limit - 1);
}

export async function updateTraderScore(address: string, pnl: number): Promise<void> {
  await redis.zadd(leaderboardKey(), { score: pnl, member: address });
}

export async function getTrader(address: string): Promise<TraderStore | null> {
  return redis.get<TraderStore>(traderKey(address));
}

export async function setTrader(address: string, trader: TraderStore): Promise<void> {
  await redis.set(traderKey(address), trader, { keepTtl: true });
}

export interface TraderStore {
  address: string;
  username?: string;
  displayName?: string;
  totalPnl: number;
  winRate: number;
  totalTrades: number;
  avgEdge: number;
  maxDrawdown: number;
  overallRank?: number;
  followersCount: number;
  followingCount: number;
  firstSeenAt: string;
  lastActiveAt: string;
  positions: PositionStore[];
  closedPositions: PositionStore[];
  pnlHistory: { date: string; pnl: number }[];
}

// --- Position ---
export interface PositionStore {
  id: string;
  side: 'YES' | 'NO';
  amount: number;
  entryPrice: number;
  currentPrice?: number;
  pnl?: number;
  pnlPercent?: number;
  status: 'open' | 'closed' | 'settled';
  marketSlug: string;
  marketQuestion: string;
  openedAt: string;
  closedAt?: string;
  txHash?: string;
}

// --- Payment ---
export interface PaymentStore {
  ref: string;
  userId: string;
  plan: 'free' | 'pro';
  chain: string;
  address: string;
  amount: string;
  currency: string;
  status: 'pending' | 'confirmed' | 'expired';
  txHash?: string;
  createdAt: string;
  expiresAt: string;
}

export async function getPayment(ref: string): Promise<PaymentStore | null> {
  return redis.get<PaymentStore>(paymentKey(ref));
}

export async function setPayment(ref: string, payment: PaymentStore): Promise<void> {
  await redis.set(paymentKey(ref), payment, { keepTtl: true });
}

export async function updatePaymentStatus(
  ref: string,
  status: 'pending' | 'confirmed' | 'expired',
  txHash?: string
): Promise<void> {
  const payment = await getPayment(ref);
  if (!payment) return;
  payment.status = status;
  if (txHash) payment.txHash = txHash;
  await setPayment(ref, payment);
}
