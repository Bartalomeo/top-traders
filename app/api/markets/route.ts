import { NextResponse } from 'next/server';
import { getActiveMarkets, getHotMarkets } from '@/lib/polymarket-api';

export async function GET() {
  try {
    const [markets, hot] = await Promise.all([
      getActiveMarkets(),
      getHotMarkets(6),
    ]);

    return NextResponse.json({
      markets: markets.slice(0, 50), // Limit for performance
      hot,
      count: markets.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Markets API error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
