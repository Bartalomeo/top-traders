import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

// Read markets from Redis (written by VPS cron every 5 min)
// Fallback to Gamma API if Redis is empty

async function getMarketsFromRedis(): Promise<any[]> {
  try {
    const data = await redis.get<string>('tt:markets:index');
    if (!data) return [];
    
    // Handle JSON string stored directly
    let slugs: string[];
    if (typeof data === 'string') {
      try { slugs = JSON.parse(data); }
      catch { slugs = []; }
    } else if (Array.isArray(data)) {
      slugs = data;
    } else {
      slugs = [];
    }
    if (slugs.length === 0) return [];

    const markets = [];
    for (const slug of slugs.slice(0, 50)) {
      const m = await redis.hgetall<Record<string, string>>(`tt:market:${slug}`);
      if (m && Object.keys(m).length > 0) {
        markets.push({
          slug,
          id: m.id,
          question: m.question,
          description: m.description,
          yesPrice: parseFloat(m.yesPrice || '0.5'),
          noPrice: parseFloat(m.noPrice || '0.5'),
          volume24h: parseFloat(m.volume24h || '0'),
          totalVolume: parseFloat(m.totalVolume || '0'),
          category: m.category || 'other',
          endDate: m.endDate || null,
          active: m.active === '1',
          closed: false,
          updatedAt: m.updatedAt,
        });
      }
    }
    return markets;
  } catch (err) {
    console.error('[Redis markets] error:', err);
    return [];
  }
}

export async function GET() {
  try {
    // Try Redis first (VPS-written data)
    let markets = await getMarketsFromRedis();
    let source = 'redis';

    // Fallback to Gamma API if Redis is empty
    if (markets.length === 0) {
      try {
        const res = await fetch('https://gamma-api.polymarket.com/markets?active=true', {
          next: { revalidate: 60 },
        });
        if (res.ok) {
          const data = await res.json();
          markets = (Array.isArray(data) ? data : []).slice(0, 50).map((m: any) => {
            const prices = m.markets?.[0]?.outcomePrices?.split(',') || ['0.5', '0.5'];
            return {
              id: m.id,
              slug: m.slug,
              question: m.question,
              description: m.description || m.question,
              yesPrice: parseFloat(prices[0]) || 0.5,
              noPrice: parseFloat(prices[1]) || 0.5,
              volume24h: parseFloat(m.volume24h) || 0,
              totalVolume: parseFloat(m.totalVolume || m.volume24h) || 0,
              category: guessCategory(m.question),
              endDate: m.endDateIso || null,
              active: m.active ?? true,
              closed: m.closed ?? false,
            };
          });
          source = 'gamma';
        }
      } catch (err) {
        console.error('[Gamma fallback] error:', err);
      }
    }

    const hot = markets
      .filter((m: any) => !m.closed && m.active)
      .sort((a: any, b: any) => (b.volume24h || 0) - (a.volume24h || 0))
      .slice(0, 6);

    return NextResponse.json({
      markets,
      hot,
      count: markets.length,
      source,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Markets API error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function guessCategory(question: string): string {
  const lower = question.toLowerCase();
  if (/crypto|bitcoin|ethereum|nft|defi|web3|solana|blockchain|ai|artificial intelligence|chatgpt|gpt|llm/.test(lower)) return 'crypto';
  if (/election|trump|biden|president|congress|senate|vote|republican|democrat|governor|parliament|prime minister/.test(lower)) return 'political';
  if (/game|team|player|match|championship|league|nba|nfl|soccer|football|olympic|world cup|tennis|golf|baseball/.test(lower)) return 'sports';
  if (/fed|rate|inflation|economy|gdp|unemployment|recession|bank|market crash|stock/.test(lower)) return 'economic';
  return 'other';
}
