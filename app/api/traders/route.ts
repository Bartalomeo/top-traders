import { NextRequest, NextResponse } from 'next/server';

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || 'https://relevant-mole-108874.upstash.io';
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || 'gQAAAAAAAalKAAIgcDEwZGVkYWYxNzhlMjA0MmY0YjA4MzQzNWE4ZDhiZGNiNw';

async function redisCall(method: string, ...args: (string | number)[]) {
  const res = await fetch(UPSTASH_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${UPSTASH_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([method, ...args]),
  });
  const data = await res.json();
  return data.result;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 50);

    // Get top addresses by P&L — use ZREVRANGE (descending)
    const addresses = await redisCall('ZREVRANGE', 'tt:leaderboard', 0, limit - 1, 'WITHSCORES');

    if (!addresses || addresses.length === 0) {
      return NextResponse.json({ traders: getMockTraders(), count: 10, source: 'mock' });
    }

    // Parse flat array [addr1, score1, addr2, score2, ...]
    const traders = [];
    for (let i = 0; i < addresses.length; i += 2) {
      const address = addresses[i];
      const totalPnl = parseFloat(addresses[i + 1]) || 0;
      
      const data = await redisCall('HGETALL', `tt:trader:${address}`);
      
      if (!data || Object.keys(data).length === 0) {
        traders.push({
          address,
          displayName: formatAddress(address),
          totalPnl,
          totalVolume: 0,
          winRate: 50,
          totalTrades: 0,
          lastActiveAt: new Date().toISOString(),
        });
        continue;
      }

      traders.push({
        address,
        displayName: data.displayName || formatAddress(address),
        totalPnl: parseFloat(data.totalPnl || '0'),
        totalVolume: parseFloat(data.totalVolume || '0'),
        winRate: parseInt(data.winRate || '50'),
        totalTrades: parseInt(data.totalTrades || '0'),
        lastActiveAt: data.lastActiveAt || new Date().toISOString(),
      });
    }

    return NextResponse.json({
      traders,
      count: traders.length,
      source: 'redis',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Traders API error:', err);
    return NextResponse.json({ traders: getMockTraders(), count: 10, source: 'mock' });
  }
}

function formatAddress(addr: string) {
  if (!addr || addr.length < 12) return addr;
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

function getMockTraders() {
  return [
    { address: '0x133742000691aAa2CF5a2B970fA3bFc1B7c0cB8F', displayName: '0x1337...cB8F', totalPnl: 12450, winRate: 68, totalTrades: 156, totalVolume: 89400 },
    { address: '0x249e2F1a0c0D4C5e2A3B4d6E8F9a0B1c2D3E4F5', displayName: '0x249e...4F5', totalPnl: 8920, winRate: 72, totalTrades: 98, totalVolume: 67200 },
    { address: '0x3A5B6C7D8E9F0a1B2C3D4E5F6A7B8C9D0E1F2A3', displayName: '0x3A5B...2A3', totalPnl: 6340, winRate: 65, totalTrades: 234, totalVolume: 45100 },
    { address: '0x4B6C7D8E9F0a1B2C3D4E5F6A7B8C9D0E1F2A3B4', displayName: '0x4B6C...A3B4', totalPnl: 4120, winRate: 58, totalTrades: 312, totalVolume: 38900 },
    { address: '0x5C7D8E9F0a1B2C3D4E5F6A7B8C9D0E1F2A3B4C5', displayName: '0x5C7D...B4C5', totalPnl: 2850, winRate: 61, totalTrades: 187, totalVolume: 24600 },
    { address: '0x6D8E9F0a1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6', displayName: '0x6D8E...C5D6', totalPnl: 1690, winRate: 54, totalTrades: 421, totalVolume: 31200 },
    { address: '0x7E9F0a1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6E7', displayName: '0x7E9F...D6E7', totalPnl: 890, winRate: 49, totalTrades: 278, totalVolume: 19800 },
    { address: '0x8F0a1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6E7F8', displayName: '0x8F0a...E7F8', totalPnl: 320, winRate: 51, totalTrades: 156, totalVolume: 12400 },
    { address: '0x9A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6E7F8A9', displayName: '0x9A1B...F8A9', totalPnl: -450, winRate: 42, totalTrades: 203, totalVolume: 28900 },
    { address: '0xABC2D3E4F5A6B7C8D9E0F1A2B3C4D5E6F7A8B9C', displayName: '0xABC2...A8B9', totalPnl: -1890, winRate: 38, totalTrades: 334, totalVolume: 35600 },
  ];
}
