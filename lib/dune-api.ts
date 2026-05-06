/**
 * Dune API Client for Polymarket Trader Data
 * Dune REST API: POST /api/v1/sql/execute + GET /api/v1/execution/{id}/results
 */

const DUNE_API_KEY = process.env.DUNE_API_KEY || '7AxKk2kmqKjaAzkahH1T3mAIANxXK50P';
const DUNE_BASE_URL = 'https://api.dune.com';

export interface DuneQueryResult {
  rows: Record<string, any>[];
  metadata: {
    column_names: string[];
    column_types: string[];
    row_count: number;
    total_result_set_bytes: number;
    execution_time_millis: number;
  };
}

export interface DuneExecutionStatus {
  execution_id: string;
  state: 'QUERY_STATE_PENDING' | 'QUERY_STATE_EXECUTING' | 'QUERY_STATE_COMPLETED' | 'QUERY_STATE_FAILED';
  is_execution_finished: boolean;
  submitted_at: string;
  execution_started_at: string;
  execution_ended_at: string;
  error?: { type: string; message: string };
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function executeQuery(sql: string, timeoutMs = 60000): Promise<DuneQueryResult> {
  const execRes = await fetch(`${DUNE_BASE_URL}/api/v1/sql/execute`, {
    method: 'POST',
    headers: {
      'x-dune-api-key': DUNE_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql }),
  });

  if (!execRes.ok) {
    const err = await execRes.text();
    throw new Error(`Dune execute error ${execRes.status}: ${err}`);
  }

  const { execution_id } = await execRes.json();
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    await sleep(2000);

    const statusRes = await fetch(`${DUNE_BASE_URL}/api/v1/execution/${execution_id}/status`, {
      headers: { 'x-dune-api-key': DUNE_API_KEY },
    });

    if (!statusRes.ok) continue;
    const status: DuneExecutionStatus = await statusRes.json();

    if (status.state === 'QUERY_STATE_COMPLETED') {
      const resultsRes = await fetch(`${DUNE_BASE_URL}/api/v1/execution/${execution_id}/results`, {
        headers: { 'x-dune-api-key': DUNE_API_KEY },
      });

      if (!resultsRes.ok) throw new Error(`Dune results error ${resultsRes.status}`);
      const data = await resultsRes.json();
      return {
        rows: data.result?.rows || [],
        metadata: data.result?.metadata || {
          column_names: [], column_types: [], row_count: 0,
          total_result_set_bytes: 0, execution_time_millis: 0,
        },
      };
    }

    if (status.state === 'QUERY_STATE_FAILED') {
      throw new Error(`Dune query failed: ${status.error?.message || 'Unknown error'}`);
    }

    console.log(`[Dune] Query ${execution_id}: ${status.state}`);
  }

  throw new Error(`Dune query timeout after ${timeoutMs}ms`);
}

// ─── P&L Types ─────────────────────────────────────────────────────────────

export interface TraderPnl {
  trader: string;
  realized_pnl: number;   // from ctf_evt_payoutredemption (actual USDC claims)
  unrealized_pnl: number; // from open positions × current price
  total_pnl: number;      // realized + unrealized
  num_settlements: number;
  num_open_positions: number;
}

export interface OpenPosition {
  assetId: string;
  conditionId: string;
  side: 'YES' | 'NO';
  shares: number;        // net position in shares
  avgCost: number;       // avg USDC per share paid
  currentPrice: number;  // current price from Gamma
  marketValue: number;    // shares × currentPrice
  unrealizedPnl: number;  // marketValue - (shares × avgCost)
  question: string;
  slug: string;
  isResolved: boolean;
}

// ─── Realized P&L: ctf_evt_payoutredemption ─────────────────────────────────

export async function getTopTradersRealizedPnl(
  period: '30d' | '90d' | '365d',
  limit = 25
): Promise<Array<{
  trader: string;
  realized_pnl: number;
  num_claims: number;
}>> {
  const daysMap: Record<string, string> = {
    '30d': '30',
    '90d': '90',
    '365d': '365',
  };

  const sql = `
    SELECT
      LOWER(CAST(redeemer AS VARCHAR)) AS trader,
      SUM(CAST(payout AS DOUBLE) / 1e6) AS realized_pnl,
      COUNT(*) AS num_claims
    FROM polymarket_polygon.ctf_evt_payoutredemption
    WHERE evt_block_time >= NOW() - INTERVAL '${daysMap[period]}' DAY
    GROUP BY LOWER(CAST(redeemer AS VARCHAR))
    ORDER BY realized_pnl DESC
    LIMIT ${limit}
  `;

  console.log(`[Dune] Realized P&L top traders (${period})...`);
  const result = await executeQuery(sql);
  console.log(`[Dune] Got ${result.rows.length} traders in ${result.metadata.execution_time_millis}ms`);
  return result.rows;
}

// ─── Open Positions: ctfexchange_evt_ordersmatched ─────────────────────────

export interface TradeRaw {
  trader: string;
  asset_id: string;
  maker_amount: number;
  taker_amount: number;
  side: 'YES' | 'NO';
  evt_block_time: string;
  evt_tx_hash: string;
}

export async function getTradersOpenPositions(
  traderAddresses: string[],
  period: '30d' | '90d' | '365d'
): Promise<TradeRaw[]> {
  if (traderAddresses.length === 0) return [];

  const daysMap: Record<string, string> = {
    '30d': '30',
    '90d': '90',
    '365d': '365',
  };

  const conditions = traderAddresses
    .map(a => `LOWER(CAST(takerordermaker AS VARCHAR)) = '${a.toLowerCase()}'`)
    .join(' OR ');

  const sql = `
    SELECT
      LOWER(CAST(takerordermaker AS VARCHAR)) AS trader,
      LOWER(CAST(makerassetid AS VARCHAR)) AS asset_id,
      CAST(makeramountfilled AS DOUBLE) / 1e6 AS maker_amount,
      CAST(takeramountfilled AS DOUBLE) / 1e6 AS taker_amount,
      CASE
        WHEN LOWER(CAST(takerassetid AS VARCHAR)) = '0x0000000000000000000000000000000000000000000000000000000000000000'
        THEN 'YES'
        ELSE 'NO'
      END AS side,
      evt_block_time,
      evt_tx_hash
    FROM polymarket_polygon.ctfexchange_evt_ordersmatched
    WHERE (${conditions})
      AND evt_block_time >= NOW() - INTERVAL '${daysMap[period]}' DAY
    ORDER BY evt_block_time DESC
    LIMIT 5000
  `;

  console.log(`[Dune] Open positions: ${traderAddresses.length} traders (${period})...`);
  const result = await executeQuery(sql, 120000);
  console.log(`[Dune] Got ${result.rows.length} trades`);
  return result.rows;
}

// ─── Resolved Conditions ────────────────────────────────────────────────────

export interface ResolvedCondition {
  condition_id: string;
  payout_numerators: string; // JSON array like "[1,0]" for binary
  evt_block_time: string;
}

export async function getResolvedConditions(daysAgo = 30): Promise<Map<string, ResolvedCondition>> {
  const sql = `
    SELECT
      LOWER(CAST(conditionid AS VARCHAR)) AS condition_id,
      CAST(payoutnumerators AS VARCHAR) AS payout_numerators,
      evt_block_time
    FROM polymarket_polygon.ctf_evt_conditionresolution
    WHERE evt_block_time >= NOW() - INTERVAL '${daysAgo}' DAY
  `;

  const result = await executeQuery(sql, 120000);
  const map = new Map<string, ResolvedCondition>();
  for (const row of result.rows) {
    map.set(row.condition_id, {
      condition_id: row.condition_id,
      payout_numerators: row.payout_numerators,
      evt_block_time: row.evt_block_time,
    });
  }
  console.log(`[Dune] ${map.size} resolved conditions (last ${daysAgo}d)`);
  return map;
}

// ─── Position Aggregator ────────────────────────────────────────────────────

export function aggregateOpenPositions(
  trades: TradeRaw[],
  currentPrices: Map<string, { yesPrice: number; noPrice: number }>,
  resolvedConditions: Set<string>
): Map<string, OpenPosition[]> {
  // Group by trader
  const byTrader = new Map<string, Map<string, {
    shares: number;
    avgCost: number;
    totalCost: number;
    side: 'YES' | 'NO';
  }>>();

  for (const t of trades) {
    if (!byTrader.has(t.trader)) {
      byTrader.set(t.trader, new Map());
    }
    const positions = byTrader.get(t.trader)!;
    const key = t.asset_id;

    if (!positions.has(key)) {
      positions.set(key, { shares: 0, avgCost: 0, totalCost: 0, side: t.side });
    }
    const p = positions.get(key)!;

    // t.maker_amount = shares bought/sold
    // t.taker_amount = USDC paid/received
    // taker is the one who "takes" from AMM — pays USDC, gets shares
    // For the maker (trader), maker_amount is the shares they give, taker_amount is what they receive
    // But we track from takerordermaker's perspective: they are the counterparty to the AMM
    // taker_amount / maker_amount = price per share

    p.shares += t.maker_amount;
    p.totalCost += t.taker_amount;
    if (p.shares !== 0) {
      p.avgCost = p.totalCost / Math.abs(p.shares);
    }
    p.side = t.side;
  }

  // Build result per trader
  const result = new Map<string, OpenPosition[]>();

  for (const [trader, positions] of byTrader) {
    const traderPositions: OpenPosition[] = [];

    for (const [assetId, pos] of positions) {
      if (Math.abs(pos.shares) < 0.0001) continue; // skip zero positions

      const isResolved = resolvedConditions.has(assetId);
      const prices = currentPrices.get(assetId.toLowerCase());
      const currentPrice = prices
        ? (pos.side === 'YES' ? prices.yesPrice : prices.noPrice)
        : 0.5;

      const marketValue = Math.abs(pos.shares) * currentPrice;
      const costBasis = Math.abs(pos.shares) * pos.avgCost;
      const unrealizedPnl = marketValue - costBasis;

      traderPositions.push({
        assetId,
        conditionId: assetId,
        side: pos.side,
        shares: pos.shares,
        avgCost: pos.avgCost,
        currentPrice,
        marketValue,
        unrealizedPnl,
        question: 'Market ' + assetId.slice(0, 12),
        slug: 'market-' + assetId.slice(0, 8),
        isResolved,
      });
    }

    // Sort by absolute unrealized P&L descending
    traderPositions.sort((a, b) => Math.abs(b.unrealizedPnl) - Math.abs(a.unrealizedPnl));
    result.set(trader, traderPositions);
  }

  return result;
}

// ─── Combined: Full P&L for TOP traders ────────────────────────────────────

export interface FullTraderPnl {
  trader: string;
  realized_pnl: number;
  unrealized_pnl: number;
  total_pnl: number;
  num_claims: number;
  open_positions_count: number;
  open_positions: OpenPosition[];
}

export async function getFullTradersPnl(
  period: '30d' | '90d' | '365d',
  limit = 25
): Promise<FullTraderPnl[]> {
  // 1. Get realized P&L from payoutredemption
  const realized = await getTopTradersRealizedPnl(period, limit);
  const topAddresses = realized.map(r => r.trader);

  // 2. Get open positions from trades
  const trades = await getTradersOpenPositions(topAddresses, period);

  // 3. Get resolved conditions
  const daysMap: Record<string, number> = { '30d': 30, '90d': 90, '365d': 365 };
  const resolvedMap = await getResolvedConditions(daysMap[period]);
  const resolvedConditions = new Set(resolvedMap.keys());

  // 4. Build empty price map (we'll try Gamma after)
  const prices = new Map<string, { yesPrice: number; noPrice: number }>();

  // 5. Aggregate positions
  const positionsMap = aggregateOpenPositions(trades, prices, resolvedConditions);

  // 6. Combine
  return realized.map(r => {
    const positions = positionsMap.get(r.trader) || [];
    const unrealized_pnl = positions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
    return {
      trader: r.trader,
      realized_pnl: r.realized_pnl,
      unrealized_pnl,
      total_pnl: r.realized_pnl + unrealized_pnl,
      num_claims: r.num_claims,
      open_positions_count: positions.length,
      open_positions: positions,
    };
  });
}
