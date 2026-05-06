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
    const items: string[] = await redis.lrange(positionsKey, 0, -1);

    const positions = [];
    for (const jsonStr of items) {
      try {
        positions.push(JSON.parse(jsonStr));
      } catch {
        // skip malformed
      }
    }

    // Also get the trader's summary from Redis hash
    const meta: Record<string, string> = await redis.hgetall(`tt:trader:${address.toLowerCase()}:30d`) as any;

    return NextResponse.json({
      address: address.toLowerCase(),
      positions,
      count: positions.length,
      source: items.length > 0 ? 'live' : 'empty',
      trader: meta && meta.address ? {
        realizedPnl: meta.realizedPnl,
        numClaims: parseInt(meta.numClaims || '0'),
        rank: parseInt(meta.rank || '0'),
      } : null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
