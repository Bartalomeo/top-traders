import { NextRequest, NextResponse } from 'next/server';
import { calculateLeaderboard } from '@/lib/polymarket-api';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 100);

    const leaderboard = await calculateLeaderboard(limit);

    return NextResponse.json({
      traders: leaderboard,
      count: leaderboard.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Traders API error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
