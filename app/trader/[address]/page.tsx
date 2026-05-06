'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Activity, Shield, TrendingUp, TrendingDown,
  Loader2, DollarSign, BarChart3, AlertCircle, ExternalLink,
} from 'lucide-react';

function formatPnlDisplay(pnl: number): string {
  if (Math.abs(pnl) >= 1_000_000) return '$' + (pnl / 1_000_000).toFixed(2) + 'M';
  if (Math.abs(pnl) >= 1_000) return '$' + (pnl / 1_000).toFixed(2) + 'K';
  return '$' + pnl.toFixed(2);
}

function PositionRow({ position }: { position: any }) {
  const unrealizedPnl = parseFloat(position.unrealizedPnl || '0');
  const positive = unrealizedPnl >= 0;
  const pnlColor = positive ? 'text-emerald-400' : 'text-red-400';
  const side = position.side || 'YES';
  const shares = parseFloat(position.shares || '0');
  const currentPrice = parseFloat(position.currentPrice || '0.5');
  const avgCost = parseFloat(position.avgCost || '0');
  const marketValue = parseFloat(position.marketValue || '0');
  // Polymarket URL: strip trailing number (e.g. "russia-ukraine-ceasefire-before-gta-vi-554" -> "russia-ukraine-ceasefire-before-gta-vi")
  const slug = (position.slug || '').replace(/-\d+$/, '');
  const polymarketUrl = slug ? `https://polymarket.com/event/${slug}` : null;

  return (
    <div className="glass-card rounded-xl p-4 border border-zinc-800/60 hover:border-violet-500/30 transition-all">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Header: side badge + question */}
          <div className="flex items-center gap-2 mb-2">
            <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${
              side === 'YES'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-red-500/20 text-red-400 border border-red-500/30'
            }`}>
              {side === 'YES' ? '🟢 YES' : '🔴 NO'}
            </span>
            {position.isResolved && (
              <span className="px-2 py-0.5 rounded-lg text-xs font-medium bg-zinc-700/50 text-zinc-400">
                Resolved
              </span>
            )}
            {polymarketUrl && (
              <a
                href={polymarketUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium bg-violet-500/10 border border-violet-500/20 text-violet-400 hover:bg-violet-500/20 transition-colors"
                onClick={e => e.stopPropagation()}
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/>
                  <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
                View on Polymarket
              </a>
            )}
          </div>

          {/* Market question */}
          <p className="text-sm text-zinc-300 mb-3 line-clamp-2">
            {position.question || slug || 'Unknown market'}
          </p>

          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <div className="text-xs text-zinc-500 mb-0.5">Shares</div>
              <div className="text-sm font-mono text-white">{Math.abs(shares).toFixed(2)}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-500 mb-0.5">Avg Cost</div>
              <div className="text-sm font-mono text-white">${avgCost.toFixed(4)}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-500 mb-0.5">Current</div>
              <div className="text-sm font-mono text-white">${currentPrice.toFixed(4)}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-500 mb-0.5">Market Value</div>
              <div className="text-sm font-mono text-white">${marketValue.toFixed(2)}</div>
            </div>
          </div>
        </div>

        {/* Unrealized P&L */}
        <div className="text-right flex-shrink-0">
          <div className={`text-xl font-bold ${pnlColor}`}>
            {positive ? '+' : ''}{formatPnlDisplay(Math.abs(unrealizedPnl))}
          </div>
          <div className="text-xs text-zinc-500">Unrealized P&L</div>
        </div>
      </div>
    </div>
  );
}

export default function TraderPage() {
  const params = useParams();
  const address = (params.address as string || '').toLowerCase();
  const [traderData, setTraderData] = useState<any>(null);
  const [positions, setPositions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [positionsSource, setPositionsSource] = useState<string>('loading');

  useEffect(() => {
    if (!address) return;
    setLoading(true);

    fetch(`/api/positions?address=${address}`)
      .then(r => r.json())
      .then(data => {
        setTraderData(data.trader || null);
        setPositions(data.positions || []);
        setPositionsSource(data.source || 'error');
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [address]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
      </div>
    );
  }

  const realizedPnl = traderData ? parseFloat(traderData.realizedPnl || '0') : 0;
  const unrealizedPnl = positions.reduce((sum, p) => sum + parseFloat(p.unrealizedPnl || '0'), 0);
  const totalPnl = realizedPnl + unrealizedPnl;
  const positiveTotal = totalPnl >= 0;
  const totalColor = positiveTotal ? 'text-emerald-400' : 'text-red-400';
  const realizedColor = realizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400';
  const unrealizedColor = unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400';

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
            <h1 className="font-semibold text-white font-mono text-sm">
              {address.slice(0, 8)}...{address.slice(-6)}
            </h1>
          </div>
          {traderData && (
            <div className="text-xs text-zinc-500">
              #{traderData.rank} on leaderboard
            </div>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 relative">
        {/* Profile Card */}
        <div className="glass-card rounded-2xl p-6 border border-zinc-800/60 mb-8">
          <div className="flex flex-col md:flex-row md:items-start gap-6">
            {/* Avatar */}
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center text-3xl font-bold text-white flex-shrink-0">
              {address.slice(2, 4).toUpperCase()}
            </div>

            {/* Info */}
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-2xl font-bold text-white">Trader Profile</h2>
                <Shield className="w-5 h-5 text-violet-400" />
              </div>
              <div className="font-mono text-zinc-400 text-sm mb-6">
                {address}
              </div>

              {/* Total P&L */}
              <div className="mb-6">
                <div className="text-xs text-zinc-500 mb-1">Total P&L (Realized + Unrealized)</div>
                <div className={`text-4xl font-bold ${totalColor}`}>
                  {positiveTotal ? '+' : ''}{formatPnlDisplay(Math.abs(totalPnl))}
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 bg-zinc-900/60 rounded-xl">
                  <div className="text-xs text-zinc-500 mb-1 flex items-center gap-1">
                    <DollarSign className="w-3 h-3" /> Realized P&L
                  </div>
                  <div className={`text-lg font-bold ${realizedColor}`}>
                    {realizedPnl >= 0 ? '+' : ''}{formatPnlDisplay(Math.abs(realizedPnl))}
                  </div>
                </div>
                <div className="p-3 bg-zinc-900/60 rounded-xl">
                  <div className="text-xs text-zinc-500 mb-1 flex items-center gap-1">
                    <Activity className="w-3 h-3" /> Unrealized P&L
                  </div>
                  <div className={`text-lg font-bold ${unrealizedColor}`}>
                    {unrealizedPnl >= 0 ? '+' : ''}{formatPnlDisplay(Math.abs(unrealizedPnl))}
                  </div>
                </div>
                <div className="p-3 bg-zinc-900/60 rounded-xl">
                  <div className="text-xs text-zinc-500 mb-1">Winnings</div>
                  <div className="text-lg font-bold text-emerald-400">
                    +${parseFloat(traderData?.winnings || '0').toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </div>
                </div>
                <div className="p-3 bg-zinc-900/60 rounded-xl">
                  <div className="text-xs text-zinc-500 mb-1">Costs</div>
                  <div className="text-lg font-bold text-red-400">
                    ${parseFloat(traderData?.costs || '0').toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </div>
                </div>
                <div className="p-3 bg-zinc-900/60 rounded-xl">
                  <div className="text-xs text-zinc-500 mb-1">Settlements</div>
                  <div className="text-lg font-bold text-white">{traderData?.numClaims || 0}</div>
                </div>
                <div className="p-3 bg-zinc-900/60 rounded-xl">
                  <div className="text-xs text-zinc-500 mb-1">Trades</div>
                  <div className="text-lg font-bold text-white">{traderData?.numTrades || 0}</div>
                </div>
              </div>
            </div>

            {/* Rank */}
            {traderData && (
              <div className="text-center flex-shrink-0">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold mb-2 ${
                  traderData.rank === 1 ? 'bg-amber-500/20 text-amber-400' :
                  traderData.rank === 2 ? 'bg-zinc-400/20 text-zinc-300' :
                  traderData.rank === 3 ? 'bg-orange-400/20 text-orange-400' :
                  'bg-zinc-800/60 text-zinc-500'
                }`}>
                  #{traderData.rank}
                </div>
                <div className="text-xs text-zinc-500">30d Rank</div>
              </div>
            )}
          </div>
        </div>

        {/* Open Positions */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-white">
                Open Positions ({positions.length})
              </h3>
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              {positionsSource === 'live' ? (
                <span className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                  Live from Dune
                </span>
              ) : positionsSource === 'empty' ? (
                <span className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-yellow-400" />
                  No positions
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-zinc-500" />
                  Loading...
                </span>
              )}
            </div>
          </div>

          {positions.length === 0 ? (
            <div className="glass-card rounded-2xl p-12 border border-zinc-800/60 text-center">
              <Activity className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-500">No open positions found</p>
              <p className="text-xs text-zinc-600 mt-1">
                {positionsSource === 'empty' ? 'Trader has no active positions' : 'Loading positions...'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {positions.map((pos, i) => (
                <PositionRow key={pos.assetId + '_' + i} position={pos} />
              ))}
            </div>
          )}
        </div>

        {/* No trader found */}
        {!traderData && positions.length === 0 && (
          <div className="glass-card rounded-2xl p-12 border border-zinc-800/60 text-center">
            <AlertCircle className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
            <p className="text-zinc-500">Trader not found in 30-day leaderboard</p>
            <p className="text-xs text-zinc-600 mt-1">
              Try checking a different period or address
            </p>
            <Link href="/" className="text-violet-400 hover:text-violet-300 text-sm mt-3 inline-block">
              ← Back to Leaderboard
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
