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

/**
 * Execute a SQL query and wait for results
 */
export async function executeQuery(sql: string, timeoutMs = 60000): Promise<DuneQueryResult> {
  // Step 1: Execute
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

  // Step 2: Poll for completion
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    await sleep(2000);

    const statusRes = await fetch(`${DUNE_BASE_URL}/api/v1/execution/${execution_id}/status`, {
      headers: { 'x-dune-api-key': DUNE_API_KEY },
    });

    if (!statusRes.ok) continue;
    const status: DuneExecutionStatus = await statusRes.json();

    if (status.state === 'QUERY_STATE_COMPLETED') {
      // Step 3: Get results
      const resultsRes = await fetch(`${DUNE_BASE_URL}/api/v1/execution/${execution_id}/results`, {
        headers: { 'x-dune-api-key': DUNE_API_KEY },
      });

      if (!resultsRes.ok) throw new Error(`Dune results error ${resultsRes.status}`);
      const data = await resultsRes.json();
      return {
        rows: data.result?.rows || [],
        metadata: data.result?.metadata || { column_names: [], column_types: [], row_count: 0, total_result_set_bytes: 0, execution_time_millis: 0 },
      };
    }

    if (status.state === 'QUERY_STATE_FAILED') {
      throw new Error(`Dune query failed: ${status.error?.message || 'Unknown error'}`);
    }

    // PENDING or EXECUTING — keep waiting
    console.log(`[Dune] Query ${execution_id} status: ${status.state}`);
  }

  throw new Error(`Dune query timeout after ${timeoutMs}ms`);
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Polymarket Queries ────────────────────────────────────────────────────────

/**
 * Get top 25 traders by P&L for a given time period
 */
export async function getTopTradersByPnl(
  period: '30d' | '90d' | '365d',
  limit = 25
): Promise<Array<{
  trader: string;
  total_volume: number;
  num_trades: number;
  approx_pnl: number;
}>> {
  const intervalMap = {
    '30d': '30 DAY',
    '90d': '90 DAY',
    '365d': '365 DAY',
  };

  const sql = `
    SELECT
      LOWER(HEX(takerordermaker)) AS trader,
      SUM(CAST(makeramountfilled AS DOUBLE) / 1e6) AS total_volume,
      COUNT(*) AS num_trades,
      SUM(
        (CAST(takeramountfilled AS DOUBLE) / 1e6) -
        (CAST(makeramountfilled AS DOUBLE) / 1e6)
      ) AS approx_pnl
    FROM polymarket_polygon.ctfexchange_evt_ordersmatched
    WHERE evt_block_time >= NOW() - INTERVAL '${intervalMap[period]}'
    GROUP BY takerordermaker
    ORDER BY approx_pnl DESC
    LIMIT ${limit}
  `;

  console.log(`[Dune] Fetching top traders (${period})...`);
  const result = await executeQuery(sql);
  console.log(`[Dune] Got ${result.rows.length} traders in ${result.metadata.execution_time_millis}ms`);
  return result.rows;
}

/**
 * Get all trades for specific traders (for positions + history)
 */
export async function getTradersTrades(
  traderAddresses: string[],
  period: '30d' | '90d' | '365d'
): Promise<Array<{
  trader: string;
  asset_id: string;
  evt_block_time: string;
  evt_tx_hash: string;
  volume: number;
  taker_amount: number;
  side: 'YES' | 'NO';
}>> {
  if (traderAddresses.length === 0) return [];

  const intervalMap = { '30d': '30 DAY', '90d': '90 DAY', '365d': '365 DAY' };
  const addressesClause = traderAddresses.map(a => `LOWER(HEX(takerordermaker)) = '${a.toLowerCase()}'`).join(' OR ');

  const sql = `
    SELECT
      LOWER(HEX(takerordermaker)) AS trader,
      LOWER(HEX(makerassetid)) AS asset_id,
      evt_block_time,
      evt_tx_hash,
      CAST(makeramountfilled AS DOUBLE) / 1e6 AS volume,
      CAST(takeramountfilled AS DOUBLE) / 1e6 AS taker_amount,
      CASE
        WHEN LOWER(HEX(takerassetid)) = '0' THEN 'YES'
        ELSE 'NO'
      END AS side
    FROM polymarket_polygon.ctfexchange_evt_ordersmatched
    WHERE (${addressesClause})
      AND evt_block_time >= NOW() - INTERVAL '${intervalMap[period]}'
    ORDER BY evt_block_time DESC
  `;

  console.log(`[Dune] Fetching ${traderAddresses.length} traders' trades (${period})...`);
  const result = await executeQuery(sql, 120000);
  console.log(`[Dune] Got ${result.rows.length} trades`);
  return result.rows;
}

/**
 * Get resolved condition IDs (last N days) — to detect closed markets
 */
export async function getResolvedConditions(daysAgo = 7): Promise<Set<string>> {
  const sql = `
    SELECT DISTINCT LOWER(HEX(conditionid)) AS condition_id
    FROM polymarket_polygon.ctf_evt_conditionresolution
    WHERE evt_block_time >= NOW() - INTERVAL '${daysAgo} DAY'
  `;

  const result = await executeQuery(sql);
  const resolved = new Set(result.rows.map(r => r.condition_id));
  console.log(`[Dune] ${resolved.size} resolved conditions (last ${daysAgo}d)`);
  return resolved;
}

/**
 * Get resolved condition details with payout (for realized P&L)
 */
export async function getResolvedConditionDetails(daysAgo = 90): Promise<Map<string, {
  payout_numerators: string;
  evt_block_time: string;
}>> {
  const sql = `
    SELECT
      LOWER(HEX(conditionid)) AS condition_id,
      payoutnumerators,
      evt_block_time
    FROM polymarket_polygon.ctf_evt_conditionresolution
    WHERE evt_block_time >= NOW() - INTERVAL '${daysAgo} DAY'
  `;

  const result = await executeQuery(sql, 120000);
  const map = new Map<string, { payout_numerators: string; evt_block_time: string }>();
  for (const row of result.rows) {
    map.set(row.condition_id, {
      payout_numerators: row.payoutnumerators,
      evt_block_time: row.evt_block_time,
    });
  }
  return map;
}
