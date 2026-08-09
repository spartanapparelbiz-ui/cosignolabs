import { getStore } from "../store";
import { logError, logInfo, newRequestId } from "../log";
import { PLANS, type PublicPlanId } from "../plans";

/**
 * Internal AI cost accounting. INTERNAL is the operative word: nothing in
 * this module is ever rendered to a user. Users buy outcomes; tokens and
 * provider costs are our supply chain, not their bill.
 *
 * Every AI request writes one row: model, tokens in/out, estimated cost,
 * who, which plan, which mission. Pricing questions ("what does a mission
 * cost", "is this plan profitable") get answered from these rows — real
 * data, not estimates of estimates.
 */

export interface AiUsageRow {
  user_id: string;
  /** Which mission drove the call, when one did. */
  mission_id: string | null;
  session_id: string | null;
  /** The declared task kind (see routing.ts). */
  task: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  /**
   * USD, from the configured price table — or null when the model isn't in
   * it. Null means "we don't know", and stays null: a guessed cost in a
   * margin report is worse than a hole, because the hole gets investigated.
   */
  est_cost_usd: number | null;
  plan: string;
}

/**
 * Price table: env-configured JSON, USD per MILLION tokens, keyed by model
 * id. Model ids are already env config, so their prices must be too — a
 * hardcoded table would silently go stale the day a model id changed.
 *
 *   COSIGNO_MODEL_COSTS='{"model-id":{"input":3,"output":15}}'
 */
interface ModelPrice {
  input: number;
  output: number;
}

let priceTable: Record<string, ModelPrice> | null | undefined;

function prices(): Record<string, ModelPrice> | null {
  if (priceTable !== undefined) return priceTable;
  const raw = process.env.COSIGNO_MODEL_COSTS?.trim();
  if (!raw) {
    priceTable = null;
    return priceTable;
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, ModelPrice>;
    priceTable = parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    logError(newRequestId(), new Error("COSIGNO_MODEL_COSTS is not valid JSON"), {
      event: "cost_config_invalid",
    });
    priceTable = null;
  }
  return priceTable;
}

/** For tests — the table is cached for the life of the process otherwise. */
export function resetPriceTableForTests(): void {
  priceTable = undefined;
}

export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number | null {
  const table = prices();
  const p = table?.[model];
  if (!p || typeof p.input !== "number" || typeof p.output !== "number") return null;
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

/** Alert thresholds — env-tunable, with conservative defaults. */
function threshold(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/**
 * Record one AI request. Never throws — accounting must not be able to fail
 * the work it accounts for — and never blocks the caller's response path.
 */
export async function recordAiUsage(row: AiUsageRow): Promise<void> {
  try {
    const store = getStore();
    await store.recordAiUsage(row);

    // ---- alerts: raised as log events, checked at write time -------------
    // A mission that has quietly become expensive.
    if (row.mission_id && row.est_cost_usd !== null) {
      const missionCost = await store.aiCostForMission(row.user_id, row.mission_id);
      const cap = threshold("COSIGNO_ALERT_MISSION_COST_USD", 1);
      if (missionCost > cap) {
        logInfo("cost_alert_mission", {
          userId: row.user_id,
          missionId: row.mission_id,
          costUsd: Number(missionCost.toFixed(4)),
          thresholdUsd: cap,
        });
      }
    }

    // A user whose month-to-date cost eats into the plan's margin. The 90%
    // margin line means cost > 10% of what the plan charges.
    if (row.est_cost_usd !== null) {
      const monthCost = await store.aiCostForUserMonth(row.user_id);
      // An internal (owner) account is not in the public catalog and earns
      // no revenue, so it falls through to the $0 branch below — which is
      // the correct margin answer for it, not a lookup failure.
      const plan = PLANS[row.plan as PublicPlanId];
      const revenue = plan?.price.monthly ?? 0;
      const marginFloor = threshold("COSIGNO_ALERT_MARGIN_FLOOR", 0.9);
      if (revenue > 0 && monthCost > revenue * (1 - marginFloor)) {
        logInfo("cost_alert_margin", {
          userId: row.user_id,
          plan: row.plan,
          monthCostUsd: Number(monthCost.toFixed(4)),
          revenueUsd: revenue,
        });
      } else if (revenue === 0) {
        const freeCap = threshold("COSIGNO_ALERT_FREE_USER_COST_USD", 0.5);
        if (monthCost > freeCap) {
          logInfo("cost_alert_free_user", {
            userId: row.user_id,
            monthCostUsd: Number(monthCost.toFixed(4)),
            thresholdUsd: freeCap,
          });
        }
      }
    }
  } catch (err) {
    // Accounting failure is loggable, never fatal.
    logError(newRequestId(), err, { event: "ai_usage_record_failed" });
  }
}
