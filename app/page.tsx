'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  TrendingUp, Trophy, Crown, Activity,
  Loader2, DollarSign, TrendingDown, Zap,
} from 'lucide-react';

function formatPnlDisplay(pnl: number): string {
  if (Math.abs(pnl) >= 1_000_000) return '$' + (pnl / 1_000_000).toFixed(2) + 'M';
  if (Math.abs(pnl) >= 1_000) return '$' + (pnl / 1_000).toFixed(2) + 'K';
  return '$' + pnl.toFixed(2);
}

function TraderRow({ trader, index }: { trader: any; index: number }) {
  const pnl = trader.netPnl || 0;
  const positive = pnl >= 0;
  const pnlColor = positive ? 'text-emerald-400' : 'text-red-400';
  const pnlSign = positive ? '+' : '';

  return (
    <div className="animate-fade-up">
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

            {/* Address + Stats */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-white group-hover:text-violet-300 transition-colors font-mono text-sm">
                  {trader.address.slice(0, 6)}...{trader.address.slice(-4)}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                <span className="flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />
                  Winnings: ${(trader.winnings / 1000).toFixed(0)}K
                </span>
                <span className="flex items-center gap-1">
                  Spent: ${(trader.costs / 1000).toFixed(0)}K
                </span>
                <span>•</span>
                <span>{trader.numTrades} trades</span>
                <span>•</span>
                <span>{trader.numSettlements} settlements</span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Activity className="w-3 h-3" />
                  {trader.openPositionsCount || 0} open
                </span>
              </div>
            </div>

            {/* Net P&L */}
            <div className="text-right flex-shrink-0">
              <div className={`font-bold text-xl ${pnlColor}`}>
                {pnlSign}{formatPnlDisplay(Math.abs(pnl))}
              </div>
              <div className="text-xs text-zinc-500">
                Net P&L
                {trader.winRate !== '0' && (
                  <span className="ml-1 text-emerald-400">({trader.winRate > 0 ? '+' : ''}{trader.winRate}% ROI)</span>
                )}
              </div>
            </div>

            {/* Arrow */}
            <Chevron className="w-5 h-5 text-zinc-600 group-hover:text-violet-400 transition-colors" />
          </div>
        </div>
      </Link>
    </div>
  );
}

function Chevron({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export default function HomePage() {
  const [traders, setTraders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePeriod, setActivePeriod] = useState<'30d' | '90d' | '365d'>('30d');
  const [dataSource, setDataSource] = useState<string>('loading');

  useEffect(() => {
    setLoading(true);
    fetch(`/api/traders?period=${activePeriod}&limit=25`)
      .then(r => r.json())
      .then(data => {
        setTraders(data.traders || []);
        setDataSource(data.source || 'unknown');
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [activePeriod]);

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
              <p className="text-xs text-zinc-500">Real P&L: Winnings - Costs</p>
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 pt-12 pb-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs font-medium mb-4">
            <Zap className="w-3 h-3" />
            Real on-chain P&L from Polymarket
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Follow the <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-fuchsia-400">Best Traders</span>
          </h2>
          <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
            Track real net profit of top Polymarket traders. P&L = Total Winnings - Total Costs. Data sourced directly from on-chain events via Dune Analytics.
          </p>
        </div>

        {/* Period Selector */}
        <div className="flex justify-center">
          <div className="inline-flex items-center gap-1 p-1 bg-zinc-900/80 rounded-xl border border-zinc-800">
            {(['30d', '90d', '365d'] as const).map(period => (
              <button
                key={period}
                onClick={() => setActivePeriod(period)}
                className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                  activePeriod === period
                    ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/25'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {period === '30d' ? '30 Days' : period === '90d' ? '90 Days' : '1 Year'}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Leaderboard */}
      <section id="traders" className="max-w-6xl mx-auto px-4 pb-16">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">
                {activePeriod === '30d' ? '30-Day' : activePeriod === '90d' ? '90-Day' : '1-Year'} Leaderboard
              </h3>
              <p className="text-xs text-zinc-500">
                Ranked by net P&L (Winnings - Costs)
                <span className="ml-2 text-violet-400">• Source: Dune Analytics</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <div className={`w-2 h-2 rounded-full ${dataSource === 'live' ? 'bg-emerald-400' : 'bg-yellow-400'}`} />
            {dataSource === 'live' ? 'Live' : dataSource === 'loading' ? 'Loading...' : 'Updating...'}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
          </div>
        ) : traders.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-zinc-500 mb-2">No traders found</div>
            <div className="text-xs text-zinc-600">Data refreshes hourly — check back soon</div>
          </div>
        ) : (
          <div className="space-y-3">
            {traders.map((trader, i) => (
              <TraderRow key={trader.address} trader={trader} index={i} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
