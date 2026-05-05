import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 100);

    // Try Redis first (VPS-written leaderboard)
    let traders: any[] = [];
    let source = 'redis';

    try {
      // Get top addresses by P&L from sorted set
      const addresses = await redis.zrange<string[]>('tt:leaderboard', 0, limit - 1, {
        rev: true,
      });

      if (addresses && addresses.length > 0) {
        for (const address of addresses) {
          const data = await redis.hgetall<Record<string, string>>(`tt:trader:${address}`);
          if (data && Object.keys(data).length > 0) {
            traders.push({
              address: data.address || address,
              displayName: data.displayName || `${address.slice(0, 6)}...${address.slice(-4)}`,
              totalPnl: parseFloat(data.totalPnl || '0'),
              totalVolume: parseFloat(data.totalVolume || '0'),
              winRate: parseInt(data.winRate || '50'),
              totalTrades: parseInt(data.totalTrades || '0'),
              lastActiveAt: data.lastActiveAt || '',
            });
          }
        }
      }
    } catch (err) {
      console.error('[Redis traders] error:', err);
    }

    // Fallback to mock data if Redis is empty
    if (traders.length === 0) {
      traders = getMockTraders().slice(0, limit);
      source = 'mock';
    }

    return NextResponse.json({
      traders,
      count: traders.length,
      source,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Traders API error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function getMockTraders() {
  return [
    { address: '0x133742000691aAa2CF5a2B970fA3bFc1B7c0cB8F', displayName: '0x1337...cB8F', totalPnl: 12450, winRate: 68, totalTrades: 156, totalVolume: 89400, lastActiveAt: new Date().toISOString() },
    { address: '0x249e2F1a0c0D4C5e2A3B4d6E8F9a0B1c2D3E4F5', displayName: '0x249e...4F5', totalPnl: 8920, winRate: 72, totalTrades: 98, totalVolume: 67200, lastActiveAt: new Date().toISOString() },
    { address: '0x3A5B6C7D8E9F0a1B2C3D4E5F6A7B8C9D0E1F2A3', displayName: '0x3A5B...2A3', totalPnl: 6340, winRate: 65, totalTrades: 234, totalVolume: 45100, lastActiveAt: new Date().toISOString() },
    { address: '0x4B6C7D8E9F0a1B2C3D4E5F6A7B8C9D0E1F2A3B4', displayName: '0x4B6C...A3B4', totalPnl: 4120, winRate: 58, totalTrades: 312, totalVolume: 38900, lastActiveAt: new Date().toISOString() },
    { address: '0x5C7D8E9F0a1B2C3D4E5F6A7B8C9D0E1F2A3B4C5', displayName: '0x5C7D...B4C5', totalPnl: 2850, winRate: 61, totalTrades: 187, totalVolume: 24600, lastActiveAt: new Date().toISOString() },
    { address: '0x6D8E9F0a1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6', displayName: '0x6D8E...C5D6', totalPnl: 1690, winRate: 54, totalTrades: 421, totalVolume: 31200, lastActiveAt: new Date().toISOString() },
    { address: '0x7E9F0a1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6E7', displayName: '0x7E9F...D6E7', totalPnl: 890, winRate: 49, totalTrades: 278, totalVolume: 19800, lastActiveAt: new Date().toISOString() },
    { address: '0x8F0a1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6E7F8', displayName: '0x8F0a...E7F8', totalPnl: 320, winRate: 51, totalTrades: 156, totalVolume: 12400, lastActiveAt: new Date().toISOString() },
    { address: '0x9A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6E7F8A9', displayName: '0x9A1B...F8A9', totalPnl: -450, winRate: 42, totalTrades: 203, totalVolume: 28900, lastActiveAt: new Date().toISOString() },
    { address: '0xABC2D3E4F5A6B7C8D9E0F1A2B3C4D5E6F7A8B9C', displayName: '0xABC2...A8B9', totalPnl: -1890, winRate: 38, totalTrades: 334, totalVolume: 35600, lastActiveAt: new Date().toISOString() },
  ];
}
