'use client';

import { useState, useEffect, Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ChevronRight,
  Activity,
  Shield,
  ExternalLink,
  Trophy,
  Crown,
  TrendingUp,
  TrendingDown,
  Loader2,
  Star,
  BarChart3,
} from 'lucide-react';
import { formatVolume, CATEGORY_COLORS } from '@/lib/polymarket-api';

function PnlChart({ data }: { data: { date: string; pnl: number }[] }) {
  if (!data || data.length === 0) return <div className="h-48 flex items-center justify-center text-zinc-500">No data</div>;

  const max = Math.max(...data.map(d => d.pnl));
  const min = Math.min(...data.map(d => d.pnl));
  const range = max - min || 1;
  const height = 180;
  const width = 600;
  const padding = 40;

  const points = data.map((d, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2);
    const y = height - padding - ((d.pnl - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  }).join(' ');

  const areaPoints = `${padding},${height - padding} ${points} ${width - padding},${height - padding}`;

  const isPositive = data[data.length - 1].pnl >= 0;
  const color = isPositive ? '#22C55E' : '#EF4444';

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-48">
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((t) => {
        const y = padding + t * (height - padding * 2);
        return (
          <line
            key={t}
            x1={padding}
            y1={y}
            x2={width - padding}
            y2={y}
            stroke="#27272A"
            strokeDasharray="4,4"
          />
        );
      })}

      {/* Zero line */}
      <line
        x1={padding}
        y1={height - padding - ((0 - min) / range) * (height - padding * 2)}
        x2={width - padding}
        y2={height - padding - ((0 - min) / range) * (height - padding * 2)}
        stroke="#3F3F46"
        strokeDasharray="4,4"
      />

      {/* Area */}
      <polygon points={areaPoints} fill={color} fillOpacity="0.1" />

      {/* Line */}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Points */}
      {data.map((d, i) => {
        const x = padding + (i / (data.length - 1)) * (width - padding * 2);
        const y = height - padding - ((d.pnl - min) / range) * (height - padding * 2);
        return (
          <circle key={i} cx={x} cy={y} r="4" fill={color} stroke="#0A0A0A" strokeWidth="2" />
        );
      })}

      {/* Labels */}
      {data.filter((_, i) => i === 0 || i === data.length - 1 || i === Math.floor(data.length / 2)).map((d, i, arr) => {
        const origIndex = data.findIndex(dd => dd === d);
        const x = padding + (origIndex / (data.length - 1)) * (width - padding * 2);
        const y = height - padding - ((d.pnl - min) / range) * (height - padding * 2);
        return (
          <text key={i} x={x} y={height - 10} textAnchor="middle" fill="#71717A" fontSize="11">
            {d.date}
          </text>
        );
      })}
    </svg>
  );
}

function PositionCard({ position }: { position: any }) {
  const positive = (position.pnl || 0) >= 0;

  return (
    <Link href={`/market/${position.marketSlug}`}>
      <div className="glass-card rounded-xl p-4 border border-zinc-800/60 hover:border-violet-500/40 transition-all cursor-pointer group">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 rounded-lg text-xs font-bold ${
              position.side === 'YES'
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'bg-red-500/20 text-red-400'
            }`}>
              {position.side === 'YES' ? '🟢 YES' : '🔴 NO'}
            </span>
            <span className="text-xs text-zinc-500">{position.marketQuestion.slice(0, 40)}...</span>
          </div>
          <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-violet-400 transition-colors" />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-xs text-zinc-500 mb-1">Entry</div>
            <div className="text-sm font-mono text-white">${position.entryPrice.toFixed(4)}</div>
          </div>
          <div>
            <div className="text-xs text-zinc-500 mb-1">Current</div>
            <div className="text-sm font-mono text-white">${position.currentPrice?.toFixed(4) || '—'}</div>
          </div>
          <div>
            <div className="text-xs text-zinc-500 mb-1">P&L</div>
            <div className={`text-sm font-bold ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
              {positive ? '+' : ''}{position.pnl?.toFixed(2) || '—'}
              {position.pnlPercent !== undefined && (
                <span className="ml-1 text-xs">({position.pnlPercent >= 0 ? '+' : ''}{position.pnlPercent.toFixed(1)}%)</span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-zinc-800/40 flex items-center gap-4 text-xs text-zinc-500">
          <span className="flex items-center gap-1">
            <Activity className="w-3 h-3" />
            Opened {position.openedAt}
          </span>
          <span>{position.amount} USDC</span>
        </div>
      </div>
    </Link>
  );
}

export default function TraderPage() {
  const params = useParams();
  const router = useRouter();
  const address = params.address as string;
  const [trader, setTrader] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | 'all'>('all');

  useEffect(() => {
    fetch('/api/traders?limit=50')
      .then(r => r.json())
      .then(data => {
        const found = (data.traders || []).find((t: any) => t.address === address);
        setTrader(found || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [address]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!trader) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Trader not found</h2>
          <Link href="/" className="text-violet-400 hover:text-violet-300">← Back to Home</Link>
        </div>
      </div>
    );
  }

  const positive = trader.totalPnl >= 0;
  const pnlColor = positive ? 'text-emerald-400' : 'text-red-400';
  const chartData = trader.pnlHistory || [];

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute w-[500px] h-[500px] rounded-full blur-[200px] opacity-[0.06] bg-violet-600"
          style={{ left: '30%', top: '10%' }} />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-zinc-800/50 backdrop-blur-xl bg-[#0A0A0A]/80">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center gap-4">
          <Link href="/" className="text-zinc-500 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1">
            <h1 className="font-semibold text-white">{trader.displayName}</h1>
          </div>
          <button className="px-4 py-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 rounded-xl text-sm font-semibold text-white">
            Follow
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 relative">
        {/* Profile Header */}
        <div className="glass-card rounded-2xl p-6 border border-zinc-800/60 mb-8"
        >
          <div className="flex flex-col md:flex-row md:items-start gap-6">
            {/* Avatar */}
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center text-3xl font-bold text-white flex-shrink-0">
              {trader.displayName[0]}
            </div>

            {/* Info */}
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-2xl font-bold">{trader.displayName}</h2>
                {trader.isVerified && <Shield className="w-5 h-5 text-violet-400" />}
              </div>
              <div className="flex items-center gap-2 text-zinc-400 text-sm mb-4">
                <span className="font-mono">{trader.address.slice(0, 8)}...{trader.address.slice(-6)}</span>
                {trader.twitterHandle && (
                  <>
                    <span>•</span>
                    <span>@{trader.twitterHandle}</span>
                    <ExternalLink className="w-3 h-3" />
                  </>
                )}
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Total P&L</div>
                  <div className={`text-xl font-bold ${pnlColor}`}>
                    {positive ? '+' : ''}{formatVolume(trader.totalPnl)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Win Rate</div>
                  <div className="text-xl font-bold text-white">{trader.winRate}%</div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Avg Edge</div>
                  <div className="text-xl font-bold text-white">+{trader.avgEdge}%</div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Total Trades</div>
                  <div className="text-xl font-bold text-white">{trader.totalTrades}</div>
                </div>
              </div>
            </div>

            {/* Rank Badge */}
            <div className="text-center">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold mb-2 ${
                trader.overallRank === 1 ? 'bg-amber-500/20 text-amber-400' :
                trader.overallRank === 2 ? 'bg-zinc-400/20 text-zinc-300' :
                trader.overallRank === 3 ? 'bg-orange-400/20 text-orange-400' :
                'bg-zinc-800/60 text-zinc-500'
              }`}>
                #{trader.overallRank}
              </div>
              <div className="text-xs text-zinc-500">Rank</div>
            </div>
          </div>

          {/* Category Breakdown */}
          {trader.categoryStats && (
            <div className="mt-6 pt-6 border-t border-zinc-800/40">
              <h3 className="text-sm text-zinc-500 mb-3">Category Breakdown</h3>
              <div className="grid grid-cols-3 gap-4">
                {Object.entries(trader.categoryStats).map(([cat, stats]: [string, any]) => (
                  <div key={cat} className="p-3 bg-zinc-900/60 rounded-xl">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[cat] || '#A855F7' }} />
                      <span className="text-xs text-zinc-400 capitalize">{cat}</span>
                    </div>
                    <div className="text-lg font-bold text-white">{formatVolume(stats.pnl)}</div>
                    <div className="text-xs text-zinc-500">{stats.winRate}% WR • {stats.trades} trades</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* P&L Chart */}
        <div className="glass-card rounded-2xl p-6 border border-zinc-800/60 mb-8"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold">P&L Over Time</h3>
            <div className="flex gap-2">
              {(['7d', '30d', '90d', 'all'] as const).map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    timeRange === range
                      ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                      : 'text-zinc-500 hover:text-white'
                  }`}
                >
                  {range === 'all' ? 'All' : range.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <PnlChart data={chartData} />
        </div>

        {/* Open Positions */}
        {trader.positions && trader.positions.length > 0 && (
          <div className="mb-8"
          >
            <h3 className="text-lg font-semibold mb-4">Open Positions ({trader.positions.length})</h3>
            <div className="grid gap-4">
              {trader.positions.map((pos: any) => (
                <PositionCard key={pos.id} position={pos} />
              ))}
            </div>
          </div>
        )}

        {/* Closed Positions */}
        {trader.closedPositions && trader.closedPositions.length > 0 && (
          <div
          >
            <h3 className="text-lg font-semibold mb-4">Closed Positions ({trader.closedPositions.length})</h3>
            <div className="grid gap-4">
              {trader.closedPositions.map((pos: any) => (
                <PositionCard key={pos.id} position={pos} />
              ))}
            </div>
          </div>
        )}

        {(!trader.positions || trader.positions.length === 0) && (!trader.closedPositions || trader.closedPositions.length === 0) && (
          <div className="text-center py-12 text-zinc-500">
            No positions found for this trader
          </div>
        )}
      </main>
    </div>
  );
}
