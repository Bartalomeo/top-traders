#!/usr/bin/env node
/**
 * Dune Leaderboard Worker v3 — REAL P&L = Winnings - Costs
 *
 * P&L Formula:
 *   Realized P&L = Σ(payouts) - Σ(USDC spent trading)
 *                = Σ(ctf_evt_payoutredemption.payout) - Σ(ctfexchange_evt_ordersmatched.takeramountfilled)
 *
 * Real traders = addresses with BOTH costs AND payouts (excludes LP/AMM contracts)
 * Open Positions = trades in unresolved markets, aggregated per trader
 *
 * Usage:
 *   node dune-leaderboard.js all       — refresh all periods + positions
 *   node dune-leaderboard.js 30d       — 30d leaderboard
 *   node dune-leaderboard.js 90d       — 90d leaderboard
 *   node dune-leaderboard.js 365d      — 365d leaderboard
 *   node dune-leaderboard.js positions  — refresh open positions
 */

const https = require('https');
const httpsGet = function(url, timeout) {
  timeout = timeout || 15000;
  return new Promise(function(resolve, reject) {
    const req = https.get(url, function(res) {
      let data = '';
      res.on('data', function(c) { data += c; });
      res.on('end', function() { resolve(data); });
    });
    req.on('error', reject);
    req.setTimeout(timeout, function() { req.destroy(); reject(new Error('Timeout')); });
  });
};

// ─── Config ─────────────────────────────────────────────────────────────────
const DUNE_API_KEY = process.env.DUNE_API_KEY || '7AxKk2kmqKjaAzkahH1T3mAIANxXK50P';
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || 'https://relevant-mole-108874.upstash.io';
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || 'gQAAAAAAAalKAAIgcDEwZGVkYWYxNzhlMjA0MmY0YjA4MzQzNWE4ZDhiZGNiNw';
const GAMMA_BASE = 'https://gamma-api.polymarket.com';
const TOP_N = 25;
const POSITIONS_LIMIT = 50;

// ─── Dune API ───────────────────────────────────────────────────────────────
async function duneExecute(sql, timeoutMs) {
  timeoutMs = timeoutMs || 90000;
  const execRes = await fetch('https://api.dune.com/api/v1/sql/execute', {
    method: 'POST',
    headers: { 'x-dune-api-key': DUNE_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql: sql }),
  });
  if (!execRes.ok) throw new Error('Dune execute error: ' + await execRes.text());
  const { execution_id } = await execRes.json();

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise(function(r) { setTimeout(r, 2000); });
    process.stdout.write('.');
    const stRes = await fetch('https://api.dune.com/api/v1/execution/' + execution_id + '/status', {
      headers: { 'x-dune-api-key': DUNE_API_KEY },
    });
    const st = await stRes.json();
    if (st.state === 'QUERY_STATE_COMPLETED') {
      const rRes = await fetch('https://api.dune.com/api/v1/execution/' + execution_id + '/results', {
        headers: { 'x-dune-api-key': DUNE_KEY },
      });
      const r = await rRes.json();
      return r.result || { rows: [], metadata: {} };
    }
    if (st.state === 'QUERY_STATE_FAILED') throw new Error('Query failed: ' + (st.error && st.error.message));
  }
  throw new Error('Dune query timeout after ' + timeoutMs + 'ms');
}

async function duneQuery(sql, timeoutMs) {
  timeoutMs = timeoutMs || 90000;
  const execRes = await fetch('https://api.dune.com/api/v1/sql/execute', {
    method: 'POST',
    headers: { 'x-dune-api-key': DUNE_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql: sql }),
  });
  if (!execRes.ok) throw new Error('Dune execute error: ' + await execRes.text());
  const { execution_id } = await execRes.json();

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise(function(r) { setTimeout(r, 2500); });
    process.stdout.write('.');
    const stRes = await fetch('https://api.dune.com/api/v1/execution/' + execution_id + '/status', {
      headers: { 'x-dune-api-key': DUNE_API_KEY },
    });
    if (!stRes.ok) { await new Promise(function(r) { setTimeout(r, 2000); }); continue; }
    const st = await stRes.json();
    if (st.state === 'QUERY_STATE_COMPLETED') {
      const rRes = await fetch('https://api.dune.com/api/v1/execution/' + execution_id + '/results', {
        headers: { 'x-dune-api-key': DUNE_API_KEY },
      });
      if (!rRes.ok) throw new Error('Dune results error: ' + rRes.status);
      const r = await rRes.json();
      console.log(' (' + (Date.now() - start) + 'ms)');
      return r.result || { rows: [], metadata: {} };
    }
    if (st.state === 'QUERY_STATE_FAILED') throw new Error('Query failed: ' + (st.error && st.error.message));
  }
  throw new Error('Dune query timeout after ' + timeoutMs + 'ms');
}

// ─── Redis ──────────────────────────────────────────────────────────────────
async function redisCmd(method) {
  const args = Array.prototype.slice.call(arguments, 1);
  const res = await fetch(UPSTASH_URL, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + UPSTASH_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify([method].concat(args)),
  });
  const d = await res.json();
  if (d.error) throw new Error('Redis error: ' + d.error);
  return d.result;
}

// ─── Gamma API ───────────────────────────────────────────────────────────────
let gammaCache = null;
let gammaCacheTime = 0;

async function getGammaCache() {
  if (gammaCache && (Date.now() - gammaCacheTime) < 300000) return gammaCache;
  console.log('[Gamma] Fetching markets...');
  try {
    const data = await httpsGet(GAMMA_BASE + '/markets?active=true&closed=false', 10000);
    const markets = JSON.parse(data);
    if (!Array.isArray(markets)) { gammaCache = {}; gammaCacheTime = Date.now(); return {}; }

    const cache = {};
    for (let i = 0; i < markets.length; i++) {
      const m = markets[i];
      const prices = (m.outcomePrices || '0.5,0.5').split(',');
      const yesPrice = parseFloat(prices[0]) || 0.5;
      const noPrice = parseFloat(prices[1]) || 0.5;
      const clobTokenIds = m.clobTokenIds || [];
      cache[m.conditionId] = { slug: m.slug, question: m.question, yesPrice: yesPrice, noPrice: noPrice };
      if (clobTokenIds.length >= 2) {
        cache['tok_' + clobTokenIds[0].toLowerCase()] = cache[m.conditionId];
        cache['tok_' + clobTokenIds[1].toLowerCase()] = cache[m.conditionId];
      }
    }
    gammaCache = cache;
    gammaCacheTime = Date.now();
    console.log('[Gamma] Cached ' + Object.keys(cache).length + ' entries');
    return cache;
  } catch (err) {
    console.error('[Gamma] Error: ' + err.message);
    return {};
  }
}

// ─── Dune Queries ────────────────────────────────────────────────────────────

// REAL P&L: top traders by (winnings - costs)
async function getLeaderboardPnl(period) {
  const daysMap = { '30d': '30', '90d': '90', '365d': '365' };
  const num = daysMap[period];

  // Real P&L = Σ payouts - Σ costs
  // Only include traders with BOTH costs and payouts (filters out LP/AMM contracts)
  const sql =
    "WITH \n" +
    "trade_costs AS (\n" +
    "  SELECT\n" +
    "    LOWER(CAST(takerordermaker AS VARCHAR)) AS trader,\n" +
    "    SUM(CAST(takeramountfilled AS DOUBLE)/1e6) AS total_spent,\n" +
    "    COUNT(*) AS num_trades\n" +
    "  FROM polymarket_polygon.ctfexchange_evt_ordersmatched\n" +
    "  WHERE evt_block_time >= NOW() - INTERVAL '" + num + "' DAY\n" +
    "  GROUP BY 1\n" +
    "),\n" +
    "payouts AS (\n" +
    "  SELECT\n" +
    "    LOWER(CAST(redeemer AS VARCHAR)) AS trader,\n" +
    "    SUM(CAST(payout AS DOUBLE)/1e6) AS total_payout,\n" +
    "    COUNT(*) AS num_claims\n" +
    "  FROM polymarket_polygon.ctf_evt_payoutredemption\n" +
    "  WHERE evt_block_time >= NOW() - INTERVAL '" + num + "' DAY\n" +
    "  GROUP BY 1\n" +
    ")\n" +
    "SELECT\n" +
    "  COALESCE(tc.trader, ap.trader) AS trader,\n" +
    "  COALESCE(ap.total_payout, 0) AS winnings,\n" +
    "  COALESCE(tc.total_spent, 0) AS costs,\n" +
    "  COALESCE(ap.total_payout, 0) - COALESCE(tc.total_spent, 0) AS net_pnl,\n" +
    "  COALESCE(tc.num_trades, 0) AS num_trades,\n" +
    "  COALESCE(ap.num_claims, 0) AS num_settlements\n" +
    "FROM trade_costs tc\n" +
    "FULL OUTER JOIN payouts ap ON tc.trader = ap.trader\n" +
    "WHERE tc.total_spent > 0 AND ap.total_payout > 0\n" +
    "ORDER BY net_pnl DESC\n" +
    "LIMIT " + TOP_N;

  console.log('[Dune] Real P&L leaderboard (' + period + ')...');
  const result = await duneQuery(sql, 120000);
  console.log('[Dune] Got ' + (result.rows ? result.rows.length : 0) + ' traders');
  return result.rows || [];
}

// Resolved condition IDs (for detecting which markets are settled)
async function getResolvedConditionIds(daysAgo) {
  daysAgo = daysAgo || 30;
  const sql =
    "SELECT DISTINCT LOWER(CAST(conditionid AS VARCHAR)) AS condition_id\n" +
    "FROM polymarket_polygon.ctf_evt_conditionresolution\n" +
    "WHERE evt_block_time >= NOW() - INTERVAL '" + daysAgo + "' DAY";
  try {
    const result = await duneQuery(sql, 60000);
    const set = new Set();
    for (let i = 0; i < (result.rows || []).length; i++) {
      set.add(result.rows[i].condition_id);
    }
    return set;
  } catch (e) {
    console.error('[Dune] Resolved conditions error: ' + e.message);
    return new Set();
  }
}

// Trades for open positions (unresolved markets only)
async function getTradersTrades(traderAddresses, period) {
  if (!traderAddresses || traderAddresses.length === 0) return [];

  const daysMap = { '30d': '30', '90d': '90', '365d': '365' };
  const num = daysMap[period];
  const conditions = traderAddresses.map(function(a) {
    return "LOWER(CAST(takerordermaker AS VARCHAR)) = '" + a.toLowerCase() + "'";
  }).join(' OR ');

  // Get takerassetid (= market token ID) as the asset identifier
  const sql =
    "SELECT\n" +
    "  LOWER(CAST(takerordermaker AS VARCHAR)) AS trader,\n" +
    "  LOWER(CAST(takerassetid AS VARCHAR)) AS asset_id,\n" +
    "  CAST(makeramountfilled AS DOUBLE)/1e6 AS maker_amount,\n" +
    "  CAST(takeramountfilled AS DOUBLE)/1e6 AS taker_amount,\n" +
    "  CASE WHEN LOWER(CAST(takerassetid AS VARCHAR)) = '0x0000000000000000000000000000000000000000000000000000000000000000' THEN 'YES' ELSE 'NO' END AS side,\n" +
    "  evt_block_time,\n" +
    "  evt_tx_hash\n" +
    "FROM polymarket_polygon.ctfexchange_evt_ordersmatched\n" +
    "WHERE (" + conditions + ")\n" +
    "  AND evt_block_time >= NOW() - INTERVAL '" + num + "' DAY\n" +
    "ORDER BY evt_block_time DESC\n" +
    "LIMIT 5000";

  console.log('[Dune] Trades: ' + traderAddresses.length + ' traders (' + period + ')...');
  const result = await duneQuery(sql, 120000);
  return result.rows || [];
}

// ─── Position Aggregator ────────────────────────────────────────────────────

function aggregatePositions(trades, resolvedSet) {
  // Group by trader
  const byTrader = {};
  for (let i = 0; i < trades.length; i++) {
    const t = trades[i];
    if (!byTrader[t.trader]) byTrader[t.trader] = {};
    const pos = byTrader[t.trader];
    const key = t.asset_id;

    if (!pos[key]) {
      pos[key] = { shares: 0, totalCost: 0, side: t.side };
    }
    const p = pos[key];
    // shares: net tokens accumulated (positive = long, negative = short)
    // totalCost: net USDC spent
    p.shares += t.maker_amount;
    p.totalCost += t.taker_amount;
    p.side = t.side;
  }

  // Build result
  const result = {};
  for (const trader of Object.keys(byTrader)) {
    const positions = byTrader[trader];
    const computed = [];

    for (const assetId of Object.keys(positions)) {
      const pos = positions[assetId];
      if (Math.abs(pos.shares) < 0.0001) continue;

      const isResolved = resolvedSet.has(assetId);
      const absShares = Math.abs(pos.shares);
      const avgCost = absShares > 0 ? pos.totalCost / absShares : 0;

      computed.push({
        assetId: assetId,
        side: pos.side,
        shares: pos.shares,
        avgCost: avgCost,
        isResolved: isResolved,
        // We'll enrich with Gamma prices below
      });
    }

    // Sort by abs value
    computed.sort(function(a, b) {
      return Math.abs(b.shares * b.avgCost) - Math.abs(a.shares * a.avgCost);
    });

    result[trader] = computed.slice(0, POSITIONS_LIMIT);
  }

  return result;
}

function enrichPositionsWithGamma(positions, gamma) {
  for (const trader of Object.keys(positions)) {
    for (let i = 0; i < positions[trader].length; i++) {
      const p = positions[trader][i];
      const gInfo = gamma[p.assetId] || gamma['tok_' + p.assetId] || null;

      if (gInfo) {
        p.question = gInfo.question || p.assetId.slice(0, 12);
        p.slug = gInfo.slug || 'market';
        p.currentPrice = p.side === 'YES' ? gInfo.yesPrice : gInfo.noPrice;
      } else {
        p.question = 'Market ' + p.assetId.slice(0, 12);
        p.slug = 'market-' + p.assetId.slice(0, 8);
        p.currentPrice = p.isResolved ? 0 : 0.5; // unknown resolved = 0, open = 0.5
      }

      // Compute unrealized P&L
      const absShares = Math.abs(p.shares);
      p.marketValue = absShares * p.currentPrice;
      p.unrealizedPnl = p.marketValue - (absShares * p.avgCost);
    }
  }
}

// ─── Redis Storage ───────────────────────────────────────────────────────────

async function storeLeaderboard(period, traders) {
  const lbKey = 'tt:leaderboard:' + period;
  await redisCmd('DEL', lbKey);

  for (let i = 0; i < traders.length; i++) {
    const t = traders[i];
    const addr = t.trader;
    const netPnl = parseFloat(t.net_pnl) || 0;
    const winnings = parseFloat(t.winnings) || 0;
    const costs = parseFloat(t.costs) || 0;
    const numTrades = parseInt(t.num_trades) || 0;
    const numSettlements = parseInt(t.num_settlements) || 0;

    // Score = net P&L for sorted set ranking
    await redisCmd('ZADD', lbKey, netPnl, addr);

    // Hash with full stats
    await redisCmd('HSET', 'tt:trader:' + addr + ':' + period,
      'address', addr,
      'netPnl', netPnl.toFixed(4),
      'winnings', winnings.toFixed(4),
      'costs', costs.toFixed(4),
      'numTrades', String(numTrades),
      'numSettlements', String(numSettlements),
      'rank', String(i + 1),
    );
    await redisCmd('EXPIRE', 'tt:trader:' + addr + ':' + period, '86400');
  }

  console.log('[Redis] Stored ' + traders.length + ' traders in ' + lbKey);
}

async function storePositionsForTrader(trader, positions, period) {
  if (!positions || positions.length === 0) return;
  const key = 'tt:trader:' + trader + ':positions';
  await redisCmd('DEL', key);
  for (let i = 0; i < positions.length; i++) {
    await redisCmd('RPUSH', key, JSON.stringify(positions[i]));
  }
  await redisCmd('EXPIRE', key, '1800'); // 30 min TTL
}

// ─── Main Tasks ─────────────────────────────────────────────────────────────

async function refreshLeaderboard(period) {
  console.log('\n=== ' + period + ' Leaderboard (Real P&L = Winnings - Costs) ===');
  const traders = await getLeaderboardPnl(period);
  await storeLeaderboard(period, traders);
  return traders;
}

async function refreshAllPositions(period) {
  console.log('\n=== Open Positions (' + period + ') ===');
  const start = Date.now();

  const traders = await getLeaderboardPnl(period);
  if (!traders || traders.length === 0) {
    console.log('[Positions] No traders found');
    return;
  }

  const addresses = traders.map(function(t) { return t.trader; });
  console.log('[Positions] Processing ' + addresses.length + ' traders...');

  const trades = await getTradersTrades(addresses, period);
  console.log('[Positions] ' + (trades.length) + ' total trades');

  const resolvedSet = await getResolvedConditionIds(30);
  console.log('[Positions] ' + resolvedSet.size + ' resolved conditions');

  const gamma = await getGammaCache();

  const byTrader = aggregatePositions(trades, resolvedSet);
  enrichPositionsWithGamma(byTrader, gamma);

  let stored = 0;
  for (let i = 0; i < addresses.length; i++) {
    const addr = addresses[i];
    const positions = byTrader[addr] || [];
    if (positions.length > 0) {
      await storePositionsForTrader(addr, positions, period);
      stored++;
    }
  }

  console.log('[Positions] Stored positions for ' + stored + '/' + addresses.length + ' traders in ' + (Date.now() - start) + 'ms');
}

// ─── CLI ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const task = args[0] || 'all';
const startTime = Date.now();

async function main() {
  console.log('\n=== Dune Leaderboard v3 | Task: ' + task + ' | ' + new Date().toISOString() + ' ===');

  if (task === 'all') {
    const traders30 = await refreshLeaderboard('30d');
    await refreshAllPositions('30d');
    await refreshLeaderboard('90d');
    await refreshLeaderboard('365d');
  } else if (task === '30d') {
    await refreshLeaderboard('30d');
    await refreshAllPositions('30d');
  } else if (task === '90d') {
    await refreshLeaderboard('90d');
  } else if (task === '365d') {
    await refreshLeaderboard('365d');
  } else if (task === 'positions') {
    await refreshAllPositions('30d');
  } else {
    console.error('Unknown task: ' + task + '. Use: all | 30d | 90d | 365d | positions');
  }

  console.log('\n=== Done | ' + (Date.now() - startTime) + 'ms ===');
}

main().catch(function(err) {
  console.error('\n[FATAL]', err.message);
  process.exit(1);
});
