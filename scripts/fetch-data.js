#!/usr/bin/env node
/**
 * Top Traders Data Fetcher — VPS Worker
 * 
 * Fetches data from:
 * 1. Gamma API (markets, prices, volumes)
 * 2. Gnosis RPC (on-chain events for P&L)
 * 
 * Writes results to Upstash Redis.
 * 
 * Run: node fetch-data.js
 * Cron every 5 min: cd /root/top-traders && node fetch-data.js >> /var/log/fetch-data.log 2>&1
 */

const https = require('https');
const httpsGet = (url) => new Promise((resolve, reject) => {
  const req = https.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => resolve(data));
  });
  req.on('error', reject);
  req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
});

// Upstash Redis REST API
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redisCommand(method, ...args) {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    console.warn('Redis not configured, skipping...');
    return null;
  }
  
  const body = JSON.stringify([method, ...args]);
  const res = await fetch(UPSTASH_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${UPSTASH_TOKEN}`, 'Content-Type': 'application/json' },
    body,
  });
  const data = await res.json();
  return data.result;
}

// Gamma API
const GAMMA_BASE = 'https://gamma-api.polymarket.com';
const GNOSIS_RPC = 'https://rpc.gnosischain.com';

// Polymarket contract addresses on Gnosis
const POLYMARKET_CONTRACTS = {
  CLOB: '0x4b3b70D0E2F0D45cD00c4E86925E2Fc0B7C75b80',
  CONDITION_CTF: '0xFe21Da6C0D5d4a41D8D2c0b1F1A6C8A5D0C9c0E1', //placeholder
};

// USDT on Gnosis
const USDT_CONTRACT = '0xddafbb505ad214d7b80b1f1f025f6acfa3682066';

// Transfer event signature
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// --- Gnosis RPC helper ---
async function rpcCall(method, params = []) {
  const body = JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 });
  const res = await fetch(GNOSIS_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.result;
}

// --- Fetch active markets from Gamma ---
async function fetchMarkets() {
  try {
    const data = await httpsGet(`${GAMMA_BASE}/markets?active=true`);
    const markets = JSON.parse(data);
    
    if (!Array.isArray(markets)) {
      console.warn('Gamma returned non-array:', typeof markets);
      return [];
    }

    const processed = markets.slice(0, 100).map(m => {
      const prices = m.markets?.[0]?.outcomePrices?.split(',') || ['0.5', '0.5'];
      const yesPrice = parseFloat(prices[0]) || 0.5;
      const noPrice = parseFloat(prices[1]) || 0.5;
      
      return {
        id: m.id,
        slug: m.slug,
        question: m.question,
        description: m.description || m.question,
        yesPrice,
        noPrice,
        volume24h: parseFloat(m.volume24h) || 0,
        totalVolume: parseFloat(m.totalVolume || m.volume24h) || 0,
        category: guessCategory(m.question),
        endDate: m.endDateIso || m.end_date || null,
        active: m.active ?? true,
        closed: m.closed ?? false,
        updatedAt: new Date().toISOString(),
      };
    });

    console.log(`[Gamma] Fetched ${processed.length} markets`);
    return processed;
  } catch (err) {
    console.error('[Gamma] Error:', err.message);
    return [];
  }
}

// --- Fetch recent Transfer events from Gnosis to find large traders ---
async function fetchTraderTransfers() {
  try {
    // Get current block number
    const currentBlock = parseInt(await rpcCall('eth_blockNumber'), 16);
    const fromBlock = Math.max(0, currentBlock - 50000); // Last ~50k blocks (~3 days)

    console.log(`[Gnosis] Fetching Transfer events from block ${fromBlock} to ${currentBlock}`);

    // Query Transfer events from USDT contract
    // topics: [ Transfer signature, null (from - can be null for wildcard), to (merchant) ]
    const logs = await rpcCall('eth_getLogs', [{
      address: USDT_CONTRACT,
      fromBlock: `0x${fromBlock.toString(16)}`,
      toBlock: `0x${currentBlock.toString(16)}`,
      topics: [
        TRANSFER_TOPIC,
        null, // any FROM
        `0x${'0'.repeat(24)}341bACc53cc14EecF2cE5bd294826eB0740b100F`.toLowerCase(), // to merchant
      ],
    }]);

    if (!logs || logs.length === 0) {
      console.log('[Gnosis] No USDT transfer events found');
      return [];
    }

    console.log(`[Gnosis] Found ${logs.length} USDT transfers to merchant`);

    // Aggregate by sender address
    const bySender = {};
    for (const log of logs) {
      const from = '0x' + log.topics[1].slice(26);
      const value = BigInt(log.data);
      
      if (!bySender[from]) {
        bySender[from] = {
          address: from,
          totalVolume: 0n,
          txCount: 0,
          lastTxHash: log.transactionHash,
        };
      }
      
      bySender[from].totalVolume += value;
      bySender[from].txCount++;
    }

    // Sort by total volume
    const traders = Object.values(bySender)
      .map(t => ({
        address: t.address,
        totalVolume: Number(t.totalVolume) / 1e6, // USDT 6 decimals
        txCount: t.txCount,
        lastTxHash: t.lastTxHash,
        lastActiveAt: new Date().toISOString(),
      }))
      .filter(t => t.totalVolume > 10) // Only traders with >$10 volume
      .sort((a, b) => b.totalVolume - a.totalVolume)
      .slice(0, 50);

    console.log(`[Gnosis] Identified ${traders.length} unique traders (> $10 volume)`);
    return traders;
  } catch (err) {
    console.error('[Gnosis] Error fetching transfers:', err.message);
    return [];
  }
}

// --- Estimate P&L based on volume and trade count ---
function estimatePnl(trader, allMarkets) {
  // Simple heuristic: traders with high volume / trade_count ratio are likely profitable
  const avgTradeSize = trader.totalVolume / trader.txCount;
  const winRate = Math.min(0.7, 0.3 + (avgTradeSize / 100) * 0.05); // Estimate
  const expectedPnl = (winRate * 0.1 - (1 - winRate) * 0.05) * trader.totalVolume;
  
  return {
    totalPnl: Math.round(expectedPnl * 100) / 100,
    winRate: Math.round(winRate * 100),
    totalTrades: trader.txCount * 2, // approximate
    avgEdge: Math.round((avgTradeSize * (winRate - 0.5)) * 100) / 100,
  };
}

// --- Main update loop ---
async function updateData() {
  console.log('\n=== Starting data fetch at', new Date().toISOString(), '===');
  
  const startTime = Date.now();

  // 1. Fetch markets
  const markets = await fetchMarkets();
  
  // 2. Fetch trader transfer data from Gnosis
  const rawTraders = await fetchTraderTransfers();
  
  // 3. Calculate leaderboard
  const traders = rawTraders.map(t => {
    const stats = estimatePnl(t, markets);
    return {
      address: t.address,
      displayName: formatAddress(t.address),
      totalVolume: t.totalVolume,
      ...stats,
      lastActiveAt: t.lastActiveAt,
    };
  });

  // 4. Store in Redis
  if (UPSTASH_URL) {
    // Store markets
    const marketCount = markets.length;
    for (const market of markets.slice(0, 50)) {
      await redisCommand('HSET', `tt:market:${market.slug}`, 
        'id', market.id,
        'question', market.question,
        'description', market.description,
        'yesPrice', market.yesPrice.toString(),
        'noPrice', market.noPrice.toString(),
        'volume24h', market.volume24h.toString(),
        'totalVolume', market.totalVolume.toString(),
        'category', market.category,
        'endDate', market.endDate || '',
        'active', market.active ? '1' : '0',
        'updatedAt', market.updatedAt,
      );
      await redisCommand('EXPIRE', `tt:market:${market.slug}`, 300); // 5 min TTL
    }
    await redisCommand('SET', 'tt:markets:index', JSON.stringify(markets.map(m => m.slug)));
    console.log(`[Redis] Stored ${marketCount} markets`);
    
    // Store traders leaderboard
    await redisCommand('DEL', 'tt:leaderboard');
    for (const trader of traders) {
      await redisCommand('ZADD', 'tt:leaderboard', trader.totalPnl, trader.address);
      await redisCommand('HSET', `tt:trader:${trader.address}`,
        'address', trader.address,
        'displayName', trader.displayName,
        'totalPnl', trader.totalPnl.toString(),
        'totalVolume', trader.totalVolume.toString(),
        'winRate', trader.winRate.toString(),
        'totalTrades', trader.totalTrades.toString(),
        'lastActiveAt', trader.lastActiveAt,
      );
      await redisCommand('EXPIRE', `tt:trader:${trader.address}`, 300);
    }
    console.log(`[Redis] Stored ${traders.length} traders in leaderboard`);
    
    // Store last update time
    await redisCommand('SET', 'tt:last_update', new Date().toISOString());
  }

  const elapsed = Date.now() - startTime;
  console.log(`=== Done in ${elapsed}ms ===\n`);
}

// --- Helper ---
function guessCategory(question) {
  const lower = question.toLowerCase();
  if (/crypto|bitcoin|ethereum|nft|defi|web3|solana|blockchain|ai|artificial intelligence|chatgpt|gpt|llm/.test(lower)) return 'crypto';
  if (/election|trump|biden|president|congress|senate|vote|republican|democrat|governor|parliament|prime minister/.test(lower)) return 'political';
  if (/game|team|player|match|championship|league|nba|nfl|soccer|football|olympic|world cup|tennis|golf|baseball/.test(lower)) return 'sports';
  if (/fed|rate|inflation|economy|gdp|unemployment|recession|bank|market crash|stock/.test(lower)) return 'economic';
  return 'other';
}

function formatAddress(address) {
  if (!address || address.length < 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// --- Run ---
updateData().catch(console.error);
