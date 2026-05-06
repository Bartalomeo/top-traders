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

    const positionsKey = `tt:trader:${address}:positions`;
    // Use LRANGE since positions are stored as a list via RPUSH
    const items: string[] = await redis.lrange(positionsKey, 0, -1);

    const positions = [];
    for (const jsonStr of items) {
      try {
        positions.push(JSON.parse(jsonStr));
      } catch {
        // skip malformed
      }
    }

    return NextResponse.json({
      address,
      positions,
      count: positions.length,
      source: items.length > 0 ? 'live' : 'empty',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
