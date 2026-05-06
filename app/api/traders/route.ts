import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

// Use REST API directly for ZREVRANGE since Upstash SDK zrevrange has issues
async function zrevrange(key: string, start: number, stop: number): Promise<string[]> {
  const res = await fetch(process.env.UPSTASH_REDIS_REST_URL!, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + process.env.UPSTASH_REDIS_REST_TOKEN!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(['ZREVRANGE', key, start, stop, 'WITHSCORES']),
  });
  const data = await res.json();
  return data.result || [];
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const period = (searchParams.get('period') || '30d') as '30d' | '90d' | '365d';
    const limit = Math.min(parseInt(searchParams.get('limit') || '25'), 100);

    const lbKey = `tt:leaderboard:${period}`;
    // ZREVRANGE via REST API for descending order (highest PnL first)
    const raw: string[] = await zrevrange(lbKey, 0, limit - 1);

    const traders = [];
    for (let i = 0; i < raw.length; i += 2) {
      const addr = raw[i];
      const netPnl = parseFloat(raw[i + 1]);

      const meta: Record<string, string> = await redis.hgetall(`tt:trader:${addr}:${period}`) as any;

      const posKey = `tt:trader:${addr}:positions`;
      const posCount: number = await redis.llen(posKey);

      const winnings = parseFloat(meta.winnings || '0');
      const costs = parseFloat(meta.costs || '0');

      traders.push({
        address: addr,
        rank: Math.floor(i / 2) + 1,
        netPnl,
        netPnlDisplay: formatPnl(netPnl),
        winnings,
        costs,
        numTrades: parseInt(meta.numTrades || '0'),
        numSettlements: parseInt(meta.numSettlements || '0'),
        openPositionsCount: posCount,
        winRate: costs > 0 ? ((winnings / costs - 1) * 100).toFixed(1) : '0',
      });
    }

    return NextResponse.json({
      traders,
      count: traders.length,
      period,
      source: traders.length > 0 ? 'live' : 'empty',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, source: 'error' }, { status: 500 });
  }
}

function formatPnl(pnl: number): string {
  if (Math.abs(pnl) >= 1_000_000) return (pnl / 1_000_000).toFixed(2) + 'M';
  if (Math.abs(pnl) >= 1_000) return (pnl / 1_000).toFixed(2) + 'K';
  return pnl.toFixed(2);
}
