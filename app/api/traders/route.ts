import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

const PERIOD_KEYS: Record<string, string> = {
  '30d': 'tt:leaderboard:30d',
  '90d': 'tt:leaderboard:90d',
  '365d': 'tt:leaderboard:365d',
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const period = (searchParams.get('period') || '30d') as '30d' | '90d' | '365d';
    const limit = Math.min(parseInt(searchParams.get('limit') || '25'), 25);

    const lbKey = PERIOD_KEYS[period] || PERIOD_KEYS['30d'];

    // Get top addresses by P&L score (sorted set, descending)
    // ZREVRANGE returns [member, score, member, score, ...]
    const addresses: string[] = await redis.zrange(lbKey, 0, limit - 1, { rev: true, withScores: true });

    if (!addresses || addresses.length === 0) {
      return NextResponse.json({
        traders: [],
        count: 0,
        period,
        source: 'empty',
        timestamp: new Date().toISOString(),
      });
    }

    // Parse [addr, score, addr, score, ...] into trader objects
    const traders = [];
    for (let i = 0; i < addresses.length; i += 2) {
      const address = addresses[i] as string;
      const score = addresses[i + 1] as number;
      const traderKey = `tt:trader:${address}:${period}`;

      let data: Record<string, string> = {};
      try {
        const raw = await redis.hgetall<Record<string, string>>(traderKey);
        if (raw && Object.keys(raw).length > 0) {
          data = raw;
        }
      } catch (e) {
        // ignore
      }

      traders.push({
        address,
        displayName: data.displayName || formatAddress(address),
        totalPnl: parseFloat(data.totalPnl || '0'),
        totalVolume: parseFloat(data.totalVolume || '0'),
        numTrades: parseInt(data.numTrades || '0'),
        winRate: parseInt(data.winRate || '50'),
        rank: parseInt(data.rank || '0') || (Math.floor(i / 2) + 1),
        period,
      });
    }

    return NextResponse.json({
      traders,
      count: traders.length,
      period,
      source: 'dune',
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Traders API error:', err);
    return NextResponse.json(
      { traders: [], count: 0, error: err.message },
      { status: 500 }
    );
  }
}

function formatAddress(addr: string) {
  if (!addr || addr.length < 12) return addr || '';
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}
