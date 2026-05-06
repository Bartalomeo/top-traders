import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const address = searchParams.get('address');

    if (!address) {
      return NextResponse.json({ error: 'address required' }, { status: 400 });
    }

    const positionsKey = `tt:trader:${address.toLowerCase()}:positions`;
    const raw: unknown[] = await redis.lrange(positionsKey, 0, -1);

    // Upstash SDK deserializes JSON strings automatically, so items may be objects or strings
    const positions = [];
    for (const item of raw) {
      if (typeof item === 'string') {
        try { positions.push(JSON.parse(item)); }
        catch { /* skip malformed */ }
      } else if (item && typeof item === 'object') {
        positions.push(item);
      }
    }

    // Get trader summary from Redis hash
    const meta: Record<string, string> = await redis.hgetall(`tt:trader:${address.toLowerCase()}:30d`) as any;

    return NextResponse.json({
      address: address.toLowerCase(),
      positions,
      count: positions.length,
      source: positions.length > 0 ? 'live' : 'empty',
      trader: meta && meta.address ? {
        realizedPnl: meta.netPnl || meta.realizedPnl || '0',
        winnings: meta.winnings || '0',
        costs: meta.costs || '0',
        numClaims: parseInt(meta.numSettlements || meta.numClaims || '0'),
        numTrades: parseInt(meta.numTrades || '0'),
        rank: parseInt(meta.rank || '0'),
        netPnl: parseFloat(meta.netPnl || meta.realizedPnl || '0'),
      } : null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
