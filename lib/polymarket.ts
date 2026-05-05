// Polymarket Gamma API integration
const GAMMA_BASE_URL = 'https://gamma-api.polymarket.com';

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
  createdAt: string;
  updatedAt: string;
  endDateIso: string | null;
  active?: boolean;
  closed?: boolean;
}

export async function getActiveMarkets(): Promise<GammaMarket[]> {
  try {
    const res = await fetch(`${GAMMA_BASE_URL}/markets?active=true&closed=false`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function getMarketBySlug(slug: string): Promise<GammaMarket | null> {
  const markets = await getActiveMarkets();
  return markets.find(m => m.slug === slug) || null;
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

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'No end date';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function getCategoryFromQuestion(question: string): string {
  const lower = question.toLowerCase();
  if (/crypto|bitcoin|ethereum|nft|defi|web3|solana|blockchain/.test(lower)) return 'crypto';
  if (/election|trump|biden|president|congress|senate|vote|republican|democrat|governor/.test(lower)) return 'political';
  if (/game|team|player|match|championship|league|nba|nfl|soccer|football|olympic|world cup/.test(lower)) return 'sports';
  if (/fed|rate|inflation|economy|gdp|unemployment|recession/.test(lower)) return 'economic';
  return 'other';
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

// Mock trader data for demo
export function getMockTraders() {
  return [
    {
      address: '0x742d35Cc6634C0532925a3b844Bc9e7595f8E2b1',
      username: 'CryptoWhale.eth',
      displayName: 'CryptoWhale',
      totalPnl: 45230.5,
      winRate: 72,
      totalTrades: 342,
      avgEdge: 18,
      maxDrawdown: -3400,
      overallRank: 1,
      followersCount: 1247,
      followingCount: 23,
      firstSeenAt: '2024-01-15',
      lastActiveAt: '2024-06-01',
      twitterHandle: 'cryptowhale',
      isVerified: true,
      categoryStats: {
        crypto: { pnl: 29400, winRate: 75, trades: 220 },
        political: { pnl: 11300, winRate: 68, trades: 85 },
        sports: { pnl: 4530, winRate: 70, trades: 37 },
      },
      positions: [
        {
          id: 'pos_1',
          side: 'YES' as const,
          amount: 4000,
          entryPrice: 0.42,
          currentPrice: 0.58,
          pnl: 1520,
          pnlPercent: 38,
          status: 'open' as const,
          marketSlug: 'bitcoin-100k-2024',
          marketQuestion: 'Will Bitcoin be above $100,000 by end of 2024?',
          openedAt: '2024-05-15',
          txHash: '0xabc123',
        },
        {
          id: 'pos_2',
          side: 'NO' as const,
          amount: 2000,
          entryPrice: 0.35,
          currentPrice: 0.31,
          pnl: 114,
          pnlPercent: 6.5,
          status: 'open' as const,
          marketSlug: 'trump-wins-2024',
          marketQuestion: 'Will Trump win the 2024 presidential election?',
          openedAt: '2024-04-20',
          txHash: '0xdef456',
        },
      ],
      closedPositions: [
        {
          id: 'pos_closed_1',
          side: 'YES' as const,
          amount: 3000,
          entryPrice: 0.30,
          currentPrice: 0.95,
          pnl: 6500,
          pnlPercent: 216,
          status: 'closed' as const,
          marketSlug: 'ethereum-pivot-done',
          marketQuestion: 'Will Ethereum complete its pivot to PoS by 2024?',
          openedAt: '2024-02-01',
          closedAt: '2024-04-15',
          txHash: '0xclosed1',
        },
      ],
      pnlHistory: [
        { date: '2024-01', pnl: 1200 },
        { date: '2024-02', pnl: 3800 },
        { date: '2024-03', pnl: 12400 },
        { date: '2024-04', pnl: 8900 },
        { date: '2024-05', pnl: 15230 },
        { date: '2024-06', pnl: 3700 },
      ],
    },
    {
      address: '0x8Ba1f109551bD432803012645Ac136ddd64DBA72',
      username: 'PredictorPro',
      displayName: 'PredictorPro',
      totalPnl: 28450.0,
      winRate: 68,
      totalTrades: 215,
      avgEdge: 12,
      maxDrawdown: -2100,
      overallRank: 2,
      followersCount: 892,
      followingCount: 45,
      firstSeenAt: '2024-02-01',
      lastActiveAt: '2024-06-01',
      twitterHandle: 'predictorpro',
      isVerified: true,
      categoryStats: {
        crypto: { pnl: 14200, winRate: 70, trades: 110 },
        political: { pnl: 8900, winRate: 65, trades: 70 },
        sports: { pnl: 5350, winRate: 68, trades: 35 },
      },
      positions: [
        {
          id: 'pos_3',
          side: 'YES' as const,
          amount: 5000,
          entryPrice: 0.52,
          currentPrice: 0.58,
          pnl: 560,
          pnlPercent: 18,
          status: 'open' as const,
          marketSlug: 'bitcoin-100k-2024',
          marketQuestion: 'Will Bitcoin be above $100,000 by end of 2024?',
          openedAt: '2024-05-20',
          txHash: '0xpred1',
        },
      ],
      closedPositions: [],
      pnlHistory: [
        { date: '2024-01', pnl: 800 },
        { date: '2024-02', pnl: 2100 },
        { date: '2024-03', pnl: 5600 },
        { date: '2024-04', pnl: 4200 },
        { date: '2024-05', pnl: 9800 },
        { date: '2024-06', pnl: 5950 },
      ],
    },
    {
      address: '0x1234567890abcdef1234567890abcdef12345678',
      username: 'WhaleWatch',
      displayName: 'WhaleWatch',
      totalPnl: 21120.0,
      winRate: 65,
      totalTrades: 178,
      avgEdge: 15,
      maxDrawdown: -1800,
      overallRank: 3,
      followersCount: 654,
      followingCount: 31,
      firstSeenAt: '2024-02-15',
      lastActiveAt: '2024-06-01',
      twitterHandle: 'whalewatch',
      isVerified: false,
      categoryStats: {
        crypto: { pnl: 8500, winRate: 62, trades: 80 },
        political: { pnl: 7600, winRate: 70, trades: 65 },
        sports: { pnl: 5020, winRate: 65, trades: 33 },
      },
      positions: [
        {
          id: 'pos_4',
          side: 'NO' as const,
          amount: 3500,
          entryPrice: 0.33,
          currentPrice: 0.31,
          pnl: 340,
          pnlPercent: 9,
          status: 'open' as const,
          marketSlug: 'trump-wins-2024',
          marketQuestion: 'Will Trump win the 2024 presidential election?',
          openedAt: '2024-05-10',
          txHash: '0xww1',
        },
      ],
      closedPositions: [],
      pnlHistory: [
        { date: '2024-01', pnl: 500 },
        { date: '2024-02', pnl: 1800 },
        { date: '2024-03', pnl: 4200 },
        { date: '2024-04', pnl: 6500 },
        { date: '2024-05', pnl: 5100 },
        { date: '2024-06', pnl: 3020 },
      ],
    },
    {
      address: '0xabcd1234abcd1234abcd1234abcd1234abcd1234',
      username: 'DataDriven.eth',
      displayName: 'DataDriven',
      totalPnl: 15840.0,
      winRate: 70,
      totalTrades: 156,
      avgEdge: 14,
      maxDrawdown: -1200,
      overallRank: 4,
      followersCount: 421,
      followingCount: 18,
      firstSeenAt: '2024-03-01',
      lastActiveAt: '2024-06-01',
      isVerified: false,
      positions: [],
      closedPositions: [],
      pnlHistory: [
        { date: '2024-03', pnl: 3200 },
        { date: '2024-04', pnl: 4800 },
        { date: '2024-05', pnl: 5600 },
        { date: '2024-06', pnl: 2240 },
      ],
    },
    {
      address: '0xdef45678def45678def45678def45678def45678',
      username: 'MarketMaverick',
      displayName: 'MarketMaverick',
      totalPnl: 12350.0,
      winRate: 63,
      totalTrades: 142,
      avgEdge: 11,
      maxDrawdown: -900,
      overallRank: 5,
      followersCount: 312,
      followingCount: 27,
      firstSeenAt: '2024-03-10',
      lastActiveAt: '2024-06-01',
      isVerified: false,
      positions: [],
      closedPositions: [],
      pnlHistory: [
        { date: '2024-03', pnl: 2100 },
        { date: '2024-04', pnl: 3500 },
        { date: '2024-05', pnl: 4200 },
        { date: '2024-06', pnl: 2550 },
      ],
    },
    {
      address: '0x9876fedc9876fedc9876fedc9876fedc9876fedc',
      username: 'AlphaSeeker',
      displayName: 'AlphaSeeker',
      totalPnl: 9870.0,
      winRate: 61,
      totalTrades: 118,
      avgEdge: 9,
      maxDrawdown: -750,
      overallRank: 6,
      followersCount: 234,
      followingCount: 15,
      firstSeenAt: '2024-03-20',
      lastActiveAt: '2024-06-01',
      isVerified: false,
      positions: [],
      closedPositions: [],
      pnlHistory: [
        { date: '2024-03', pnl: 1800 },
        { date: '2024-04', pnl: 2900 },
        { date: '2024-05', pnl: 3200 },
        { date: '2024-06', pnl: 1970 },
      ],
    },
    {
      address: '0xfedcba09fedcba09fedcba09fedcba09fedcba09',
      username: 'InsightTrader',
      displayName: 'InsightTrader',
      totalPnl: 7540.0,
      winRate: 58,
      totalTrades: 95,
      avgEdge: 8,
      maxDrawdown: -600,
      overallRank: 7,
      followersCount: 178,
      followingCount: 22,
      firstSeenAt: '2024-04-01',
      lastActiveAt: '2024-06-01',
      isVerified: false,
      positions: [],
      closedPositions: [],
      pnlHistory: [
        { date: '2024-04', pnl: 2100 },
        { date: '2024-05', pnl: 3100 },
        { date: '2024-06', pnl: 2340 },
      ],
    },
    {
      address: '0x123abc45123abc45123abc45123abc45123abc45',
      username: 'StrategicBet',
      displayName: 'StrategicBet',
      totalPnl: 5890.0,
      winRate: 64,
      totalTrades: 78,
      avgEdge: 10,
      maxDrawdown: -480,
      overallRank: 8,
      followersCount: 145,
      followingCount: 12,
      firstSeenAt: '2024-04-10',
      lastActiveAt: '2024-06-01',
      isVerified: false,
      positions: [],
      closedPositions: [],
      pnlHistory: [
        { date: '2024-04', pnl: 1500 },
        { date: '2024-05', pnl: 2400 },
        { date: '2024-06', pnl: 1990 },
      ],
    },
    {
      address: '0xabc123def456abc123def456abc123def456abc1',
      username: 'Precision Markets',
      displayName: 'Precision Markets',
      totalPnl: 4230.0,
      winRate: 60,
      totalTrades: 65,
      avgEdge: 7,
      maxDrawdown: -350,
      overallRank: 9,
      followersCount: 98,
      followingCount: 8,
      firstSeenAt: '2024-04-20',
      lastActiveAt: '2024-06-01',
      isVerified: false,
      positions: [],
      closedPositions: [],
      pnlHistory: [
        { date: '2024-04', pnl: 1200 },
        { date: '2024-05', pnl: 1800 },
        { date: '2024-06', pnl: 1230 },
      ],
    },
    {
      address: '0xdef789012def789012def789012def789012def7',
      username: 'SmartPosition',
      displayName: 'SmartPosition',
      totalPnl: 3150.0,
      winRate: 62,
      totalTrades: 52,
      avgEdge: 6,
      maxDrawdown: -280,
      overallRank: 10,
      followersCount: 67,
      followingCount: 5,
      firstSeenAt: '2024-05-01',
      lastActiveAt: '2024-06-01',
      isVerified: false,
      positions: [],
      closedPositions: [],
      pnlHistory: [
        { date: '2024-05', pnl: 1500 },
        { date: '2024-06', pnl: 1650 },
      ],
    },
  ];
}

export function getMockMarkets() {
  return [
    {
      slug: 'bitcoin-100k-2024',
      question: 'Will Bitcoin be above $100,000 by end of 2024?',
      description: 'This market resolves YES if Bitcoin closes above $100,000 USD on any major exchange before January 1, 2025.',
      currentPrice: 0.58,
      volume24h: 890000,
      totalVolume: 2300000,
      category: 'crypto',
      endDate: '2024-12-31',
      positionCount: 47,
      topTraders: ['CryptoWhale.eth', 'PredictorPro'],
    },
    {
      slug: 'trump-wins-2024',
      question: 'Will Trump win the 2024 presidential election?',
      description: 'This market resolves YES if Donald Trump wins the 2024 US Presidential election.',
      currentPrice: 0.31,
      volume24h: 1200000,
      totalVolume: 4500000,
      category: 'political',
      endDate: '2024-11-05',
      positionCount: 89,
      topTraders: ['CryptoWhale.eth', 'WhaleWatch'],
    },
    {
      slug: 'fed-cuts-50bp-q4',
      question: 'Will the Fed cut rates by 50bp or more by Q4 2024?',
      description: 'This market resolves YES if the Federal Reserve cuts the federal funds rate by at least 50 basis points before the end of Q4 2024.',
      currentPrice: 0.42,
      volume24h: 340000,
      totalVolume: 890000,
      category: 'economic',
      endDate: '2024-12-31',
      positionCount: 23,
      topTraders: ['PredictorPro'],
    },
    {
      slug: 'ethereum-5k-2024',
      question: 'Will Ethereum be above $5,000 in 2024?',
      description: 'This market resolves YES if Ethereum (ETH) exceeds $5,000 USD on any major exchange during 2024.',
      currentPrice: 0.35,
      volume24h: 560000,
      totalVolume: 1200000,
      category: 'crypto',
      endDate: '2024-12-31',
      positionCount: 31,
      topTraders: ['CryptoWhale.eth'],
    },
    {
      slug: 'nvidia-earnings-q2',
      question: 'Will NVIDIA exceed $1T market cap in Q2 2024?',
      description: 'This market resolves YES if NVIDIA reaches and maintains a market capitalization above $1 trillion USD for at least 5 consecutive trading days during Q2 2024.',
      currentPrice: 0.67,
      volume24h: 280000,
      totalVolume: 670000,
      category: 'other',
      endDate: '2024-06-30',
      positionCount: 18,
      topTraders: ['DataDriven.eth'],
    },
  ];
}
