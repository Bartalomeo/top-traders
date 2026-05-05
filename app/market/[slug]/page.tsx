'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Users,
  ExternalLink,
  ChevronRight,
  Calendar,
  BarChart3,
  ArrowUpRight,
  CheckCircle2,
  ThumbsUp,
  ThumbsDown,
  Edit3,
  MessageSquare,
  X,
  Share2,
  Loader2,
} from 'lucide-react';
import { getMockMarkets, getMockTraders, formatVolume, CATEGORY_COLORS, CATEGORY_LABELS } from '@/lib/polymarket';

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

export default function MarketPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [market, setMarket] = useState<any>(null);
  const [traders, setTraders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'wiki' | 'sentiment' | 'traders'>('wiki');
  const [wikiEditMode, setWikiEditMode] = useState(false);
  const [sentimentScore, setSentimentScore] = useState({ twitter: 0.72, volume: 12450 });

  useEffect(() => {
    const allMarkets = getMockMarkets();
    const allTraders = getMockTraders();
    const found = allMarkets.find(m => m.slug === slug);
    setMarket(found || null);
    setTraders(allTraders.filter(t =>
      found?.topTraders?.some((name: string) => t.displayName === name)
    ));
    setLoading(false);
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!market) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Market not found</h2>
          <Link href="/" className="text-violet-400 hover:text-violet-300">← Back to Home</Link>
        </div>
      </div>
    );
  }

  const categoryColor = CATEGORY_COLORS[market.category] || CATEGORY_COLORS.other;
  const yesPercent = market.currentPrice * 100;
  const noPercent = (1 - market.currentPrice) * 100;

  // Mock wiki content
  const wiki = {
    summary: market.description,
    bullCase: [
      { text: 'BlackRock ETF holdings signal strong institutional adoption, historically correlated with price appreciation', votes: 45 },
      { text: 'Historical 4-year cycle patterns suggest Q4 tends to be the strongest quarter', votes: 38 },
      { text: 'Lightning Network adoption and infrastructure improvements increasing utility', votes: 22 },
    ],
    bearCase: [
      { text: 'SEC regulatory headwinds on crypto ETFs could slow institutional flows', votes: 18 },
      { text: 'Potential macroeconomic headwinds from sustained high interest rates', votes: 12 },
    ],
    resolutionNotes: [
      { text: 'RESOLVES YES if price exceeds $100,000 at ANY point before Jan 1, 2025', votes: 89 },
      { text: 'Price only needs to touch $100k briefly — does not need to stay above', votes: 67 },
    ],
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute w-[500px] h-[500px] rounded-full blur-[200px] opacity-[0.06] bg-violet-600"
          style={{ left: '60%', top: '20%' }} />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-zinc-800/50 backdrop-blur-xl bg-[#0A0A0A]/80">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center gap-4">
          <Link href="/" className="text-zinc-500 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold text-white truncate text-sm">{market.question}</h1>
          </div>
          <a
            href={`https://polymarket.com/market/${slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 rounded-xl text-sm font-semibold text-white flex items-center gap-2"
          >
            Bet on Polymarket <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 relative">
        {/* Market Header */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          className="glass-card rounded-2xl p-6 border border-zinc-800/60 mb-8"
        >
          <div className="flex items-start justify-between mb-6">
            <div
              className="px-3 py-1.5 rounded-lg text-sm font-medium"
              style={{ backgroundColor: `${categoryColor}20`, color: categoryColor, border: `1px solid ${categoryColor}30` }}
            >
              {CATEGORY_LABELS[market.category] || 'Other'}
            </div>
            <div className="text-right">
              <div className="text-xs text-zinc-500">Resolves</div>
              <div className="text-sm font-medium">{market.endDate}</div>
            </div>
          </div>

          <h2 className="text-2xl font-bold mb-4">{market.question}</h2>

          {/* Price Display */}
          <div className="flex items-center gap-6 mb-6">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-4xl font-bold text-emerald-400">{yesPercent.toFixed(0)}%</span>
                <span className="text-lg text-zinc-400">YES</span>
              </div>
              <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all"
                  style={{ width: `${yesPercent}%` }}
                />
              </div>
            </div>
            <div className="text-center px-4">
              <div className="text-2xl font-bold text-zinc-600">vs</div>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2 justify-end">
                <span className="text-lg text-zinc-400">NO</span>
                <span className="text-4xl font-bold text-red-400">{noPercent.toFixed(0)}%</span>
              </div>
              <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-red-400 to-red-500 rounded-full ml-auto transition-all"
                  style={{ width: `${noPercent}%` }}
                />
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-zinc-800/40">
            <div className="text-center">
              <div className="text-xl font-bold text-white">{formatVolume(market.volume24h)}</div>
              <div className="text-xs text-zinc-500">24h Volume</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-white">{formatVolume(market.totalVolume)}</div>
              <div className="text-xs text-zinc-500">Total Volume</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-white">{market.positionCount}</div>
              <div className="text-xs text-zinc-500">Active Positions</div>
            </div>
          </div>
        </motion.div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-zinc-900/60 p-1 rounded-xl w-fit">
          {[
            { id: 'wiki', label: 'Wiki', icon: Edit3 },
            { id: 'sentiment', label: 'Sentiment', icon: X },
            { id: 'traders', label: 'Top Traders', icon: Users },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-violet-500/20 text-violet-300'
                  : 'text-zinc-500 hover:text-white'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Wiki Tab */}
        {activeTab === 'wiki' && (
          <motion.div initial="hidden" animate="visible" variants={fadeUp} className="space-y-6">
            {/* Summary */}
            <div className="glass-card rounded-2xl p-6 border border-zinc-800/60">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Summary</h3>
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <ThumbsUp className="w-3 h-3" /> 128 votes
                </div>
              </div>
              <p className="text-zinc-300 leading-relaxed">{wiki.summary}</p>
            </div>

            {/* Bull Case */}
            <div className="glass-card rounded-2xl p-6 border border-zinc-800/60">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-emerald-400" />
                  Bull Case
                </h3>
                <span className="text-xs text-emerald-400">78% of community</span>
              </div>
              <div className="space-y-3">
                {wiki.bullCase.map((item: any, i: number) => (
                  <div key={i} className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
                    <p className="text-zinc-300 mb-2">{item.text}</p>
                    <div className="flex items-center gap-2 text-xs text-emerald-400">
                      <ThumbsUp className="w-3 h-3" /> {item.votes}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Bear Case */}
            <div className="glass-card rounded-2xl p-6 border border-zinc-800/60">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <TrendingDown className="w-5 h-5 text-red-400" />
                  Bear Case
                </h3>
                <span className="text-xs text-red-400">22% of community</span>
              </div>
              <div className="space-y-3">
                {wiki.bearCase.map((item: any, i: number) => (
                  <div key={i} className="p-4 bg-red-500/5 border border-red-500/20 rounded-xl">
                    <p className="text-zinc-300 mb-2">{item.text}</p>
                    <div className="flex items-center gap-2 text-xs text-red-400">
                      <ThumbsUp className="w-3 h-3" /> {item.votes}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Resolution Notes */}
            <div className="glass-card rounded-2xl p-6 border border-zinc-800/60">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Community Resolution Notes</h3>
                <button className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1">
                  <Edit3 className="w-3 h-3" /> Add Note
                </button>
              </div>
              <div className="space-y-3">
                {wiki.resolutionNotes.map((note: any, i: number) => (
                  <div key={i} className="p-4 bg-violet-500/5 border border-violet-500/20 rounded-xl">
                    <p className="text-zinc-300 mb-2">{note.text}</p>
                    <div className="flex items-center gap-3 text-xs text-zinc-500">
                      <span className="flex items-center gap-1 text-emerald-400">
                        <ThumbsUp className="w-3 h-3" /> {note.votes}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* Sentiment Tab */}
        {activeTab === 'sentiment' && (
          <motion.div initial="hidden" animate="visible" variants={fadeUp} className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              {/* X Sentiment */}
              <div className="glass-card rounded-2xl p-6 border border-zinc-800/60">
                <div className="flex items-center gap-2 mb-4">
                  <X className="w-5 h-5 text-[#1DA1F2]" />
                  <h3 className="text-lg font-semibold">X/Twitter Sentiment</h3>
                </div>
                <div className="text-center py-6">
                  <div className="text-5xl font-bold text-emerald-400 mb-2">
                    {(sentimentScore.twitter * 100).toFixed(0)}%
                  </div>
                  <div className="text-sm text-zinc-400 mb-4">Bullish</div>
                  <div className="text-xl font-semibold text-white">{sentimentScore.volume.toLocaleString()}</div>
                  <div className="text-xs text-zinc-500">tweets (7 days)</div>
                </div>
                <div className="pt-4 border-t border-zinc-800/40 text-xs text-zinc-500">
                  Trend: +15% improvement over 7 days
                </div>
              </div>

              {/* Volume */}
              <div className="glass-card rounded-2xl p-6 border border-zinc-800/60">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart3 className="w-5 h-5 text-violet-400" />
                  <h3 className="text-lg font-semibold">Polymarket Volume</h3>
                </div>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm text-emerald-400">YES</span>
                      <span className="text-sm font-medium">{yesPercent.toFixed(1)}%</span>
                    </div>
                    <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full" style={{ width: `${yesPercent}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm text-red-400">NO</span>
                      <span className="text-sm font-medium">{noPercent.toFixed(1)}%</span>
                    </div>
                    <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-red-400 to-red-500 rounded-full" style={{ width: `${noPercent}%` }} />
                    </div>
                  </div>
                </div>
                <div className="pt-4 border-t border-zinc-800/40">
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">24h Volume</span>
                    <span className="font-medium">{formatVolume(market.volume24h)}</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Traders Tab */}
        {activeTab === 'traders' && (
          <motion.div initial="hidden" animate="visible" variants={fadeUp}>
            <div className="space-y-4">
              {traders.length > 0 ? traders.map((trader) => (
                <Link key={trader.address} href={`/trader/${trader.address}`}>
                  <div className="glass-card rounded-xl p-4 border border-zinc-800/60 hover:border-violet-500/40 transition-all cursor-pointer flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center text-lg font-bold">
                      {trader.displayName[0]}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold">{trader.displayName}</div>
                      <div className="text-xs text-zinc-500">{trader.totalTrades} trades • {trader.winRate}% win rate</div>
                    </div>
                    <div className="text-right">
                      <div className={`font-bold ${trader.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        +{formatVolume(trader.totalPnl)}
                      </div>
                      <div className="text-xs text-zinc-500">Total P&L</div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-zinc-600" />
                  </div>
                </Link>
              )) : (
                <div className="text-center py-12 text-zinc-500">
                  No trader data available for this market
                </div>
              )}
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
}
