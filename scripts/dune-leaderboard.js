#!/usr/bin/env node
/**
 * Dune Leaderboard Worker — VPS Cron Script
 * Fetches real P&L data from Dune → writes to Upstash Redis
 *
 * Usage:
 *   node dune-leaderboard.js all        — refresh all leaderboards + positions
 *   node dune-leaderboard.js 30d        — refresh 30d leaderboard + positions
 *   node dune-leaderboard.js 90d        — refresh 90d leaderboard
 *   node dune-leaderboard.js 365d       — refresh 365d leaderboard
 *   node dune-leaderboard.js positions  — refresh open positions only
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

// ─── Config ───────────────────────────────────────────────────────────────────
const DUNE_API_KEY = process.env.DUNE_API_KEY || '7AxKk2kmqKjaAzkahH1T3mAIANxXK50P';
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || 'https://relevant-mole-108874.upstash.io';
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || 'gQAAAAAAAalKAAIgcDEwZGVkYWYxNzhlMjA0MmY0YjA4MzQzNWE4ZDhiZGNiNw';
const GAMMA_BASE = 'https://gamma-api.polymarket.com';
const TOP_N = 25;

// ─── Dune API ─────────────────────────────────────────────────────────────────
async function duneExecute(sql) {
  const execRes = await fetch('https://api.dune.com/api/v1/sql/execute', {
    method: 'POST',
    headers: { 'x-dune-api-key': DUNE_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql: sql }),
  });
  if (!execRes.ok) throw new Error('Dune execute error: ' + await execRes.text());
  const { execution_id } = await execRes.json();

  const start = Date.now();
  while (Date.now() - start < 90000) {
    await new Promise(function(r) { setTimeout(r, 2000); });
    const stRes = await fetch('https://api.dune.com/api/v1/execution/' + execution_id + '/status', {
      headers: { 'x-dune-api-key': DUNE_API_KEY },
    });
    const st = await stRes.json();
    if (st.state === 'QUERY_STATE_COMPLETED') {
      const rRes = await fetch('https://api.dune.com/api/v1/execution/' + execution_id + '/results', {
        headers: { 'x-dune-api-key': DUNE_API_KEY },
      });
      const r = await rRes.json();
      return r.result || { rows: [], metadata: {} };
    }
    if (st.state === 'QUERY_STATE_FAILED') throw new Error('Query failed: ' + (st.error && st.error.message));
    process.stdout.write('.');
  }
  throw new Error('Dune query timeout');
}

// ─── Redis ─────────────────────────────────────────────────────────────────────
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

async function storeLeaderboard(period, traders) {
  const lbKey = 'tt:leaderboard:' + period;
  await redisCmd('DEL', lbKey);

  for (let i = 0; i < traders.length; i++) {
    const t = traders[i];
    const addr = t.trader;
    const pnl = parseFloat(t.approx_pnl) || 0;
    const volume = parseFloat(t.total_volume) || 0;
    const trades = parseInt(t.num_trades) || 0;

    await redisCmd('ZADD', lbKey, pnl, addr);
    await redisCmd('HSET', 'tt:trader:' + addr + ':' + period,
      'address', addr,
      'totalPnl', pnl.toFixed(4),
      'totalVolume', volume.toFixed(4),
      'numTrades', String(trades),
      'rank', String(i + 1),
    );
    await redisCmd('EXPIRE', 'tt:trader:' + addr + ':' + period, '86400');
  }

  console.log('[Redis] Stored ' + traders.length + ' traders in ' + lbKey);
}

// ─── Gamma API ─────────────────────────────────────────────────────────────────
async function gammaGetMarkets(slugs) {
  if (!slugs || slugs.length === 0) return {};
  try {
    const data = await httpsGet(GAMMA_BASE + '/markets?slug=' + slugs.join(','));
    const markets = JSON.parse(data);
    const result = {};
    const arr = Array.isArray(markets) ? markets : (markets.markets || []);
    for (let i = 0; i < arr.length; i++) {
      const m = arr[i];
      const prices = (m.outcomePrices || '0.5,0.5').split(',');
      result[m.slug] = {
        question: m.question,
        yesPrice: parseFloat(prices[0]) || 0.5,
        noPrice: parseFloat(prices[1]) || 0.5,
        totalVolume: parseFloat(m.volume || '0'),
      };
    }
    return result;
  } catch (e) {
    return {};
  }
}

// ─── Dune Queries ──────────────────────────────────────────────────────────────
async function getTopTradersFromDune(period) {
  const intervalMap = { '30d': '30', '90d': '90', '365d': '365' };
  const num = intervalMap[period];
  const sql =
    "SELECT " +
    "  LOWER(CAST(takerordermaker AS VARCHAR)) AS trader, " +
    "  SUM(CAST(makeramountfilled AS DOUBLE) / 1e6) AS total_volume, " +
    "  COUNT(*) AS num_trades, " +
    "  SUM((CAST(takeramountfilled AS DOUBLE) / 1e6) - (CAST(makeramountfilled AS DOUBLE) / 1e6)) AS approx_pnl " +
    "FROM polymarket_polygon.ctfexchange_evt_ordersmatched " +
    "WHERE evt_block_time >= NOW() - INTERVAL '" + num + "' day " +
    "GROUP BY LOWER(CAST(takerordermaker AS VARCHAR)) " +
    "ORDER BY approx_pnl DESC " +
    "LIMIT " + TOP_N;

  console.log('[Dune] Top traders ' + period + '...');
  const result = await duneExecute(sql);
  console.log(' -> ' + (result.rows ? result.rows.length : 0) + ' traders (' + (result.metadata ? result.metadata.execution_time_millis : 0) + 'ms)');
  return result.rows || [];
}

async function getTradersTradesFromDune(traderAddresses, period) {
  if (!traderAddresses || traderAddresses.length === 0) return [];
  const intervalMap = { '30d': '30', '90d': '90', '365d': '365' };
  const num = intervalMap[period];
  const conditions = traderAddresses.map(function(a) {
    return "LOWER(CAST(takerordermaker AS VARCHAR)) = '" + a.toLowerCase() + "'";
  }).join(' OR ');

  const sql =
    "SELECT " +
    "  LOWER(CAST(takerordermaker AS VARCHAR)) AS trader, " +
    "  LOWER(CAST(makerassetid AS VARCHAR)) AS asset_id, " +
    "  LOWER(CAST(takerassetid AS VARCHAR)) AS taker_asset_id, " +
    "  evt_block_time, " +
    "  evt_tx_hash, " +
    "  CAST(makeramountfilled AS DOUBLE) / 1e6 AS volume, " +
    "  CAST(takeramountfilled AS DOUBLE) / 1e6 AS taker_amount, " +
    "  CASE WHEN LOWER(CAST(takerassetid AS VARCHAR)) = '0x0000000000000000000000000000000000000000000000000000000000000000' THEN 'YES' ELSE 'NO' END AS side " +
    "FROM polymarket_polygon.ctfexchange_evt_ordersmatched " +
    "WHERE (" + conditions + ") " +
    "  AND evt_block_time >= NOW() - INTERVAL '" + num + "' day " +
    "ORDER BY evt_block_time DESC " +
    "LIMIT 1000";

  console.log('[Dune] ' + traderAddresses.length + ' traders trades (' + period + ')...');
  const result = await duneExecute(sql);
  console.log(' -> ' + (result.rows ? result.rows.length : 0) + ' trades');
  return result.rows || [];
}

// ─── Asset ID → Market Mapper ───────────────────────────────────────────────────
let assetToInfoCache = new Map();

async function buildAssetMarketCache() {
  console.log('[Gamma] Building asset->market cache...');
  // Try multiple endpoints to get as many markets as possible
  const endpoints = [
    '/markets?closed=true&active=true',
    '/markets?closed=true',
    '/markets',
  ];
  let totalAssets = 0;

  for (let e = 0; e < endpoints.length; e++) {
    try {
      const url = GAMMA_BASE + endpoints[e];
      const data = await httpsGet(url, 10000);
      const markets = JSON.parse(data);
      if (!Array.isArray(markets) || markets.length <= assetToInfoCache.size) continue;
      console.log('[Gamma] Endpoint ' + endpoints[e] + ': ' + markets.length + ' markets');
      for (let i = 0; i < markets.length; i++) {
        const m = markets[i];
        const slug = m.slug;
        const prices = (m.outcomePrices || '0.5,0.5').split(',');
        const yesPrice = parseFloat(prices[0]) || 0.5;
        const noPrice = parseFloat(prices[1]) || 0.5;
        const clobTokenIds = m.clobTokenIds || [];
        if (clobTokenIds.length >= 2) {
          // Only add if not already cached
          if (!assetToInfoCache.has(clobTokenIds[0].toLowerCase())) {
            assetToInfoCache.set(clobTokenIds[0].toLowerCase(), {
              slug: slug, question: m.question, side: 'YES',
              yesPrice: yesPrice, noPrice: noPrice,
            });
          }
          if (!assetToInfoCache.has(clobTokenIds[1].toLowerCase())) {
            assetToInfoCache.set(clobTokenIds[1].toLowerCase(), {
              slug: slug, question: m.question, side: 'NO',
              yesPrice: yesPrice, noPrice: noPrice,
            });
          }
        }
      }
    } catch (err) {
      console.log('[Gamma] Endpoint ' + endpoints[e] + ' error: ' + err.message);
    }
  }
  console.log('[Gamma] Cached ' + assetToInfoCache.size + ' assets');
}

// ─── Open Positions Calculator
function calculateOpenPositions(trades) {
  const byTrader = {};
  for (let i = 0; i < trades.length; i++) {
    const t = trades[i];
    const trader = t.trader;
    if (!byTrader[trader]) byTrader[trader] = {};
    const pos = byTrader[trader];
    const key = t.asset_id ? t.asset_id.toLowerCase() : t.asset_id;
    if (!pos[key]) {
      pos[key] = { volume: 0, avgCost: 0, numTrades: 0, takerAmount: 0, side: t.side };
    }
    const p = pos[key];
    p.takerAmount += t.taker_amount || 0;
    p.volume += t.volume || 0;
    p.avgCost = p.volume > 0 ? p.takerAmount / p.volume : 0;
    p.numTrades++;
  }

  const result = {};
  const traderAddrs = Object.keys(byTrader);
  for (let i = 0; i < traderAddrs.length; i++) {
    const trader = traderAddrs[i];
    result[trader] = [];
    const positions = byTrader[trader];
    const assetKeys = Object.keys(positions);
    for (let j = 0; j < assetKeys.length; j++) {
      const assetId = assetKeys[j];
      const pos = positions[assetId];
      // info can be null if market not in Gamma's active list — show with raw data
      const info = assetToInfoCache.get(assetId.toLowerCase());
      const currentPrice = (info && info.side === 'YES') ? info.yesPrice :
                           (info && info.side === 'NO') ? info.noPrice : 0.5;
      const avgCost = pos.avgCost;
      const side = (info && info.side) ? info.side : pos.side;
      let pnl, pnlPercent;
      if (side === 'YES') {
        pnl = pos.volume * (currentPrice - avgCost);
        pnlPercent = avgCost > 0 ? ((currentPrice - avgCost) / avgCost) * 100 : 0;
      } else {
        pnl = pos.volume * ((1 - currentPrice) - avgCost);
        pnlPercent = avgCost > 0 ? (((1 - currentPrice) - avgCost) / avgCost) * 100 : 0;
      }

      // Always include — even if market not in Gamma cache, show with asset_id label
      const slugLabel = (info && info.slug) ? info.slug : ('m_' + assetId.slice(0, 12));
      const questionLabel = (info && info.question) ? info.question :
                             (info && info.slug) ? info.slug :
                             ('Market ' + assetId.slice(0, 12));
      result[trader].push({
        assetId: assetId,
        slug: slugLabel,
        question: questionLabel,
        side: side,
        volume: pos.volume.toFixed(6),
        avgCost: avgCost.toFixed(6),
        currentPrice: currentPrice.toFixed(6),
        pnl: pnl.toFixed(4),
        pnlPercent: pnlPercent.toFixed(2),
        numTrades: pos.numTrades,
      });
    }
  }
  return result;
}

async function storePositions(traderAddress, positions) {
  if (!positions || positions.length === 0) return;
  const key = 'tt:trader:' + traderAddress + ':positions';
  await redisCmd('DEL', key);
  for (let i = 0; i < positions.length; i++) {
    await redisCmd('RPUSH', key, JSON.stringify(positions[i]));
  }
  await redisCmd('EXPIRE', key, '900');
}

// ─── Resolved Conditions ───────────────────────────────────────────────────────
async function getResolvedConditionIds(daysAgo) {
  daysAgo = daysAgo || 30;
  const sql = "SELECT DISTINCT LOWER(HEX(conditionid)) AS condition_id " +
    "FROM polymarket_polygon.ctf_evt_conditionresolution " +
    "WHERE evt_block_time >= NOW() - INTERVAL '" + daysAgo + "' day";
  try {
    const result = await duneExecute(sql);
    const set = new Set();
    for (let i = 0; i < (result.rows || []).length; i++) {
      set.add(result.rows[i].condition_id);
    }
    return set;
  } catch (e) {
    return new Set();
  }
}

// ─── Main Tasks ────────────────────────────────────────────────────────────────
async function refreshLeaderboard(period) {
  console.log('\n=== ' + period + ' Leaderboard Refresh ===');
  const traders = await getTopTradersFromDune(period);
  await storeLeaderboard(period, traders);
  return traders;
}

async function refreshPositions() {
  console.log('\n=== Open Positions Refresh ===');
  const start = Date.now();

  // ZREVRANGE WITHSCORES returns flat array: [addr, score, addr, score, ...]
  const raw = await redisCmd('ZREVRANGE', 'tt:leaderboard:30d', 0, 9);
  const addresses = [];
  for (let i = 0; i < raw.length; i += 2) {
    addresses.push(raw[i]);
  }

  if (!addresses || addresses.length === 0) {
    console.log('[Positions] No traders in leaderboard yet');
    return;
  }
  console.log('[Positions] Refreshing ' + addresses.length + ' traders');

  const trades = await getTradersTradesFromDune(addresses, '30d');
  const resolved = await getResolvedConditionIds(30);
  const byTrader = calculateOpenPositions(trades);

  let count = 0;
  for (let i = 0; i < addresses.length; i++) {
    const addr = addresses[i];
    const positions = byTrader[addr] || [];
    await storePositions(addr, positions);
    count++;
  }
  console.log('[Positions] Stored positions for ' + count + ' traders in ' + (Date.now() - start) + 'ms');
}

// ─── CLI Dispatch ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const task = args[0] || 'all';
const startTime = Date.now();

async function main() {
  console.log('\n=== Dune Leaderboard Worker | Task: ' + task + ' | ' + new Date().toISOString() + ' ===');

  await buildAssetMarketCache();

  if (task === 'all') {
    await refreshLeaderboard('30d');
    await refreshLeaderboard('90d');
    await refreshLeaderboard('365d');
    await refreshPositions();
  } else if (task === '30d') {
    await refreshLeaderboard('30d');
    await refreshPositions();
  } else if (task === '90d') {
    await refreshLeaderboard('90d');
  } else if (task === '365d') {
    await refreshLeaderboard('365d');
  } else if (task === 'positions') {
    await refreshPositions();
  } else {
    console.error('Unknown task: ' + task + '. Use: all | 30d | 90d | 365d | positions');
  }

  console.log('\n=== Done | ' + (Date.now() - startTime) + 'ms ===');
}

main().catch(function(err) {
  console.error('\n[FATAL]', err.message);
  process.exit(1);
});
