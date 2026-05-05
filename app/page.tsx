'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, type Variants } from 'framer-motion';
import {
  TrendingUp,
  Users,
  BarChart3,
  Zap,
  Shield,
  ArrowUpRight,
  ChevronRight,
  Star,
  ExternalLink,
  Search,
  Filter,
  Trophy,
  Crown,
  TrendingDown,
  Activity,
  Bookmark,
} from 'lucide-react';
import { getMockTraders, getMockMarkets, formatVolume, CATEGORY_COLORS, CATEGORY_LABELS } from '@/lib/polymarket';

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' as const } },
};

const stagger: Variants = {
  visible: { transition: { staggerChildren: 0.08 } },
};

const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.4, ease: 'backOut' as const } },
};

// P&L mini chart component
function MiniChart({ data, positive }: { data: number[]; positive: boolean }) {
  if (!data || data.length === 0) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const height = 32;
  const width = 80;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke={positive ? '#22C55E' : '#EF4444'}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TraderRow({ trader, index }: { trader: any; index: number }) {
  const positive = trader.totalPnl >= 0;
  const pnlColor = positive ? 'text-emerald-400' : 'text-red-400';
  const chartData = trader.pnlHistory?.map((h: any) => h.pnl) || [];

  return (
    <motion.div variants={fadeUp}>
      <Link href={`/trader/${trader.address}`}>
        <div className="glass-card rounded-2xl p-5 border border-zinc-800/60 hover:border-violet-500/40 transition-all duration-300 cursor-pointer group">
          <div className="flex items-center gap-4">
            {/* Rank */}
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${
              index === 0 ? 'bg-amber-500/20 text-amber-400' :
              index === 1 ? 'bg-zinc-400/20 text-zinc-300' :
              index === 2 ? 'bg-orange-400/20 text-orange-400' :
              'bg-zinc-800/60 text-zinc-500'
            }`}>
              {index === 0 ? <Crown className="w-5 h-5" /> : `#${index + 1}`}
            </div>

            {/* Avatar + Name */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-white group-hover:text-violet-300 transition-colors truncate">
                  {trader.displayName}
                </span>
                {trader.isVerified && (
                  <Shield className="w-4 h-4 text-violet-400 flex-shrink-0" />
                )}
                {trader.twitterHandle && (
                  <span className="text-zinc-500 text-xs">@{trader.twitterHandle}</span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-zinc-500">
                <span>{trader.totalTrades} trades</span>
                <span>•</span>
                <span>{trader.winRate}% win rate</span>
                <span>•</span>
                <span>+{trader.avgEdge}% avg edge</span>
              </div>
            </div>

            {/* Mini P&L Chart */}
            <div className="hidden sm:block">
              <MiniChart data={chartData} positive={positive} />
            </div>

            {/* P&L */}
            <div className="text-right">
              <div className={`font-bold text-lg ${pnlColor}`}>
                {positive ? '+' : ''}{formatVolume(trader.totalPnl)}
              </div>
              <div className="text-xs text-zinc-500">Total P&L</div>
            </div>

            {/* Arrow */}
            <ChevronRight className="w-5 h-5 text-zinc-600 group-hover:text-violet-400 transition-colors" />
          </div>

          {/* Open Positions Preview */}
          {trader.positions && trader.positions.length > 0 && (
            <div className="mt-4 pt-4 border-t border-zinc-800/40">
              <div className="flex items-center gap-2 text-xs text-zinc-500 mb-2">
                <Activity className="w-3 h-3" />
                Open Positions
              </div>
              <div className="flex flex-wrap gap-2">
                {trader.positions.slice(0, 3).map((pos: any) => (
                  <Link
                    key={pos.id}
                    href={`/market/${pos.marketSlug}`}
                    onClick={(e) => e.stopPropagation()}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${
                      pos.side === 'YES'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-red-500/10 text-red-400 border border-red-500/20'
                    } hover:opacity-80 transition-opacity`}
                  >
                    {pos.side === 'YES' ? '🟢' : '🔴'} {pos.marketQuestion.slice(0, 30)}...
                    {pos.pnlPercent !== undefined && (
                      <span className={pos.pnlPercent >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                        {pos.pnlPercent >= 0 ? '+' : ''}{pos.pnlPercent.toFixed(1)}%
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </Link>
      </motion.div>
  );
}

function MarketCard({ market }: { market: any }) {
  const categoryColor = CATEGORY_COLORS[market.category] || CATEGORY_COLORS.other;

  return (
    <motion.div variants={scaleIn}>
      <Link href={`/market/${market.slug}`}>
        <div className="glass-card rounded-2xl p-5 border border-zinc-800/60 hover:border-violet-500/40 transition-all duration-300 cursor-pointer group h-full">
          <div className="flex items-start justify-between mb-3">
            <div
              className="px-2.5 py-1 rounded-lg text-xs font-medium"
              style={{ backgroundColor: `${categoryColor}20`, color: categoryColor, border: `1px solid ${categoryColor}30` }}
            >
              {CATEGORY_LABELS[market.category] || 'Other'}
            </div>
            <span className="text-xs text-zinc-500">{formatVolume(market.totalVolume)} vol</span>
          </div>

          <h3 className="font-semibold text-white group-hover:text-violet-300 transition-colors mb-2 line-clamp-2">
            {market.question}
          </h3>

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-emerald-400 font-bold text-lg">
                  {(market.currentPrice * 100).toFixed(0)}%
                </span>
                <span className="text-xs text-zinc-500">YES</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-zinc-500">Resolves</div>
              <div className="text-xs text-white">{market.endDate}</div>
            </div>
          </div>

          {/* Price bar */}
          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all"
              style={{ width: `${market.currentPrice * 100}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-zinc-600 mt-1">
            <span>NO {(1 - market.currentPrice) * 100.toFixed(0)}%</span>
            <span>YES {market.currentPrice * 100.toFixed(0)}%</span>
          </div>

          {market.topTraders && market.topTraders.length > 0 && (
            <div className="mt-4 pt-3 border-t border-zinc-800/40">
              <div className="flex items-center gap-2 text-xs text-zinc-500 mb-2">
                <Users className="w-3 h-3" />
                Top traders
              </div>
              <div className="flex flex-wrap gap-1">
                {market.topTraders.map((name: string) => (
                  <span key={name} className="px-2 py-0.5 bg-zinc-800/60 rounded text-xs text-zinc-400">
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </Link>
    </motion.div>
  );
}

export default function HomePage() {
  const [traders, setTraders] = useState<any[]>([]);
  const [markets, setMarkets] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'pnl' | 'winRate' | 'trades'>('pnl');
  const [category, setCategory] = useState('all');

  useEffect(() => {
    const mockTraders = getMockTraders();
    const mockMarkets = getMockMarkets();
    setTraders(mockTraders);
    setMarkets(mockMarkets);
  }, []);

  const filteredTraders = traders
    .filter(t => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return t.displayName.toLowerCase().includes(q) || t.username?.toLowerCase().includes(q);
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'pnl') return b.totalPnl - a.totalPnl;
      if (sortBy === 'winRate') return b.winRate - a.winRate;
      return b.totalTrades - a.totalTrades;
    });

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      {/* Background effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute w-[600px] h-[600px] rounded-full blur-[200px] opacity-[0.07] bg-violet-600"
          style={{ left: '10%', top: '20%', transform: 'translate(-50%, -50%)' }} />
        <div className="absolute w-[400px] h-[400px] rounded-full blur-[150px] opacity-[0.05] bg-orange-500"
          style={{ right: '10%', top: '60%', transform: 'translate(50%, -50%)' }} />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-zinc-800/50 backdrop-blur-xl bg-[#0A0A0A]/80">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-white">Top Polymarket Traders</h1>
              <p className="text-xs text-zinc-500">See what the best are doing</p>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-6">
            <Link href="#traders" className="text-sm text-zinc-400 hover:text-white transition-colors">Traders</Link>
            <Link href="#markets" className="text-sm text-zinc-400 hover:text-white transition-colors">Markets</Link>
            <Link href="/auth/login" className="text-sm text-zinc-400 hover:text-white transition-colors">Sign In</Link>
            <Link
              href="/auth/login"
              className="px-4 py-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-opacity"
            >
              Get Started
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-12 relative">
        {/* Hero */}
        <motion.section
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-violet-500/10 border border-violet-500/20 rounded-full text-sm text-violet-300 mb-6">
            <Zap className="w-4 h-4" />
            Track the top performers on Polymarket
          </div>

          <h2 className="text-4xl md:text-6xl font-bold mb-4">
            See what the{' '}
            <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
              best traders
            </span>{' '}
            are doing
          </h2>

          <p className="text-zinc-400 text-lg max-w-2xl mx-auto mb-8">
            Follow top-performing Polymarket traders, track their positions in real-time,
            and learn from prediction wikis — all in one place.
          </p>

          <div className="flex items-center justify-center gap-4">
            <Link
              href="#traders"
              className="px-6 py-3 bg-gradient-to-r from-violet-600 to-fuchsia-600 rounded-xl font-semibold text-white hover:opacity-90 transition-opacity inline-flex items-center gap-2"
            >
              View Leaderboard <ArrowUpRight className="w-4 h-4" />
            </Link>
            <Link
              href="/auth/login"
              className="px-6 py-3 bg-zinc-800/60 border border-zinc-700/50 rounded-xl font-semibold text-white hover:bg-zinc-800 transition-colors"
            >
              Sign In
            </Link>
          </div>
        </motion.section>

        {/* Stats */}
        <motion.section
          initial="hidden"
          animate="visible"
          variants={stagger}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16"
        >
          {[
            { icon: Users, label: 'Active Traders', value: '2,847', color: 'text-violet-400' },
            { icon: TrendingUp, label: 'Total P&L Tracked', value: '$1.2M+', color: 'text-emerald-400' },
            { icon: BarChart3, label: 'Markets Covered', value: '340+', color: 'text-orange-400' },
            { icon: Shield, label: 'On-Chain Verified', value: '100%', color: 'text-blue-400' },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              variants={scaleIn}
              className="glass-card rounded-2xl p-5 border border-zinc-800/60 text-center"
            >
              <stat.icon className={`w-6 h-6 mx-auto mb-2 ${stat.color}`} />
              <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
              <div className="text-xs text-zinc-500">{stat.label}</div>
            </motion.div>
          ))}
        </motion.section>

        {/* How It Works */}
        <motion.section
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          className="mb-16"
        >
          <h3 className="text-2xl font-bold text-center mb-8">How It Works</h3>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                step: '01',
                title: 'Find Top Traders',
                desc: 'Browse the live leaderboard of the most profitable Polymarket traders, ranked by verified on-chain P&L.',
                icon: Trophy,
              },
              {
                step: '02',
                title: 'Track Positions',
                desc: 'See exactly what positions top traders have open, their entry prices, and real-time P&L updates.',
                icon: BarChart3,
              },
              {
                step: '03',
                title: 'Learn from Wiki',
                desc: 'Each market has a crowdsourced wiki with context, bull/bear cases, and community notes on how it resolves.',
                icon: Bookmark,
              },
            ].map((item) => (
              <motion.div
                key={item.step}
                variants={fadeUp}
                className="glass-card rounded-2xl p-6 border border-zinc-800/60"
              >
                <div className="w-12 h-12 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mb-4">
                  <item.icon className="w-6 h-6 text-violet-400" />
                </div>
                <div className="text-xs text-violet-400 font-medium mb-2">Step {item.step}</div>
                <h4 className="text-lg font-semibold mb-2">{item.title}</h4>
                <p className="text-sm text-zinc-400">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* Leaderboard */}
        <section id="traders" className="mb-16">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-2xl font-bold">Top Traders</h3>
              <p className="text-sm text-zinc-500">Ranked by total P&L — verified on-chain</p>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Search traders..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-4 py-2 bg-zinc-900/60 border border-zinc-800/80 rounded-xl text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500/50 w-48"
                />
              </div>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-3 py-2 bg-zinc-900/60 border border-zinc-800/80 rounded-xl text-sm text-white focus:outline-none focus:border-violet-500/50"
              >
                <option value="pnl">Sort by P&L</option>
                <option value="winRate">Sort by Win Rate</option>
                <option value="trades">Sort by Trades</option>
              </select>
            </div>
          </div>

          <motion.div
            variants={stagger}
            initial="hidden"
            animate="visible"
            className="space-y-4"
          >
            {filteredTraders.map((trader, i) => (
              <TraderRow key={trader.address} trader={trader} index={i} />
            ))}
          </motion.div>
        </section>

        {/* Markets */}
        <section id="markets" className="mb-16">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-2xl font-bold">Hot Markets</h3>
              <p className="text-sm text-zinc-500">Most active prediction markets</p>
            </div>

            <Link
              href="/markets"
              className="text-sm text-violet-400 hover:text-violet-300 transition-colors inline-flex items-center gap-1"
            >
              View all <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {markets.map((market) => (
              <MarketCard key={market.slug} market={market} />
            ))}
          </div>
        </section>

        {/* CTA */}
        <motion.section
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          className="relative"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-violet-600/20 to-fuchsia-600/20 rounded-3xl blur-xl" />
          <div className="relative glass-card rounded-3xl p-12 border border-violet-500/30 text-center">
            <h3 className="text-3xl font-bold mb-4">Ready to level up your predictions?</h3>
            <p className="text-zinc-400 max-w-xl mx-auto mb-8">
              Join thousands of traders who use Top Polymarket Traders to follow the best
              and make better-informed decisions.
            </p>
            <div className="flex items-center justify-center gap-4">
              <Link
                href="/auth/login"
                className="px-8 py-4 bg-gradient-to-r from-violet-600 to-fuchsia-600 rounded-xl font-semibold text-white hover:opacity-90 transition-opacity inline-flex items-center gap-2"
              >
                Start for Free <ArrowUpRight className="w-5 h-5" />
              </Link>
              <Link
                href="#traders"
                className="px-8 py-4 bg-zinc-800/60 border border-zinc-700/50 rounded-xl font-semibold text-white hover:bg-zinc-800 transition-colors"
              >
                Browse First
              </Link>
            </div>
          </div>
        </motion.section>

        {/* Footer */}
        <footer className="border-t border-zinc-800/50 mt-16 pt-8 text-center text-sm text-zinc-500">
          <p>Top Polymarket Traders — For informational purposes only. Not financial advice.</p>
          <p className="mt-2">Data sourced from on-chain activity on Polymarket (Gnosis Chain).</p>
        </footer>
      </main>
    </div>
  );
}
