// Polymarket Real Data — Gamma API + The Graph

const GAMMA_BASE_URL = 'https://gamma-api.polymarket.com';
const GRAPH_URL = 'https://gateway.thegraph.com/api/subgraphs/id/7EvBLbLvkW1MftbGpFFPoCfuLcuRRroMb';

// Gamma API Types
export interface GammaMarket {
  id: string;
  slug: string;
  question: string;
  description: string;
  markets: {
    id: string;
    conditionId: string;
    outcomePrices: string;
  }[];
  volumes: number[];
  volume24h: number;
  createdAt: string;
  updatedAt: string;
  endDateIso: string | null;
  active: boolean;
  closed: boolean;
  category?: string;
}

// The Graph Types
export interface GraphTrade {
  id: string;
  account: string;
  side: 'BUY' | 'SELL';
  amount: string;
  price: string;
  market: string;
  timestamp: string;
  transactionHash: string;
}

export interface GraphPosition {
  trader: string;
  marketSlug: string;
  side: 'YES' | 'NO';
  amount: string;
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
  openedAt: string;
}

// Cache layer
let marketCache: GammaMarket[] | null = null;
let marketCacheTime = 0;
const MARKET_CACHE_TTL = 60 * 1000; // 60 sec

// --- Gamma API ---
export async function getActiveMarkets(): Promise<GammaMarket[]> {
  const now = Date.now();
  if (marketCache && now - marketCacheTime < MARKET_CACHE_TTL) {
    return marketCache;
  }

  try {
    const res = await fetch(`${GAMMA_BASE_URL}/markets?active=true`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error(`Gamma API error: ${res.status}`);
    const data = await res.json();

    const markets: GammaMarket[] = (Array.isArray(data) ? data : data.markets || []).map((m: any) => {
      const prices = m.markets?.[0]?.outcomePrices?.split(',') || ['0.5', '0.5'];
      const yesPrice = parseFloat(prices[0]) || 0.5;

      return {
        id: m.id,
        slug: m.slug,
        question: m.question,
        description: m.description || m.question,
        markets: m.markets || [],
        volumes: m.volumes || [],
        volume24h: m.volume24h || 0,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
        endDateIso: m.endDateIso || m.end_date || null,
        active: m.active ?? true,
        closed: m.closed ?? false,
        category: guessCategory(m.question),
      };
    });

    marketCache = markets;
    marketCacheTime = now;
    return markets;
  } catch (err) {
    console.error('Gamma API error:', err);
    return marketCache || [];
  }
}

export async function getMarketBySlug(slug: string): Promise<GammaMarket | null> {
  const markets = await getActiveMarkets();
  return markets.find(m => m.slug === slug) || null;
}

export async function getHotMarkets(limit = 5): Promise<GammaMarket[]> {
  const markets = await getActiveMarkets();
  return markets
    .filter(m => !m.closed && m.active)
    .sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0))
    .slice(0, limit);
}

// --- The Graph ---
const GRAPH_HEADERS = {
  'Content-Type': 'application/json',
  // In production, use API key from env
};

async function graphQuery(query: string, variables: Record<string, any> = {}): Promise<any> {
  try {
    const res = await fetch(GRAPH_URL, {
      method: 'POST',
      headers: GRAPH_HEADERS,
      body: JSON.stringify({ query, variables }),
      next: { revalidate: 300 }, // 5 min cache
    });
    if (!res.ok) throw new Error(`Graph error: ${res.status}`);
    const data = await res.json();
    if (data.errors) throw new Error(data.errors[0]?.message || 'Graph query error');
    return data.data;
  } catch (err) {
    console.error('The Graph error:', err);
    return null;
  }
}

// Fetch recent trades to build leaderboard
export async function fetchRecentTrades(limit = 1000): Promise<GraphTrade[]> {
  const data = await graphQuery(`
    query FetchTrades($limit: Int!) {
      trades(first: $limit, orderBy: timestamp, orderDirection: desc) {
        id
        account
        side
        amount
        price
        market
        timestamp
        transactionHash
      }
    }
  `, { limit });

  return data?.trades || [];
}

// --- Leaderboard Calculation ---
export interface LeaderboardEntry {
  address: string;
  totalPnl: number;
  winRate: number;
  totalTrades: number;
  avgEdge: number;
  lastActiveAt: string;
}

export async function calculateLeaderboard(limit = 10): Promise<LeaderboardEntry[]> {
  const trades = await fetchRecentTrades(2000);

  // Aggregate by account
  const byAccount: Record<string, {
    trades: GraphTrade[];
    pnl: number;
    wins: number;
    losses: number;
  }> = {};

  for (const trade of trades) {
    if (!byAccount[trade.account]) {
      byAccount[trade.account] = { trades: [], pnl: 0, wins: 0, losses: 0 };
    }
    const acc = byAccount[trade.account];
    acc.trades.push(trade);

    const amount = parseFloat(trade.amount);
    const price = parseFloat(trade.price);
    const pnl = trade.side === 'BUY'
      ? (1 - price) * amount
      : (price - 0.5) * amount; // Simplified P&L

    acc.pnl += pnl;

    if (pnl > 0) acc.wins++;
    else if (pnl < 0) acc.losses++;
  }

  const entries: LeaderboardEntry[] = Object.entries(byAccount)
    .map(([address, data]) => ({
      address,
      totalPnl: data.pnl,
      winRate: data.trades.length > 0
        ? Math.round((data.wins / data.trades.length) * 100)
        : 0,
      totalTrades: data.trades.length,
      avgEdge: data.trades.length > 0
        ? Math.round((data.pnl / data.trades.length) * 100) / 100
        : 0,
      lastActiveAt: data.trades[0]?.timestamp || '',
    }))
    .sort((a, b) => b.totalPnl - a.totalPnl)
    .slice(0, limit);

  return entries;
}

// --- Helper ---
function guessCategory(question: string): string {
  const lower = question.toLowerCase();
  if (/crypto|bitcoin|ethereum|nft|defi|web3|solana|blockchain/.test(lower)) return 'crypto';
  if (/election|trump|biden|president|congress|senate|vote|republican|democrat|governor/.test(lower)) return 'political';
  if (/game|team|player|match|championship|league|nba|nfl|soccer|football|olympic|world cup/.test(lower)) return 'sports';
  if (/fed|rate|inflation|economy|gdp|unemployment|recession/.test(lower)) return 'economic';
  return 'other';
}

export function getCurrentPrice(market: GammaMarket): number {
  if (!market.markets || market.markets.length === 0) return 0.5;
  const prices = market.markets[0].outcomePrices.split(',');
  return parseFloat(prices[0]) || 0.5;
}

export function formatVolume(volume: number): string {
  if (volume >= 1_000_000) return `$${(volume / 1_000_000).toFixed(1)}M`;
  if (volume >= 1_000) return `$${(volume / 1_000).toFixed(1)}K`;
  return `$${volume.toFixed(0)}`;
}

export const CATEGORY_COLORS: Record<string, string> = {
  crypto: '#F7931A',
  political: '#3B82F6',
  sports: '#22C55E',
  economic: '#EAB308',
  other: '#A855F7',
};

export const CATEGORY_LABELS: Record<string, string> = {
  crypto: 'Crypto',
  political: 'Political',
  sports: 'Sports',
  economic: 'Economic',
  other: 'Other',
};
