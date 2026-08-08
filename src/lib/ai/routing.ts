import { plannerModel, type PlannerTier } from "../agent/provider";
import { logInfo } from "../log";

/**
 * Model routing — which model a piece of AI work runs on.
 *
 * The rule: the cheapest model that can correctly complete the task, always.
 * Escalation happens on EVIDENCE, never on prediction.
 *
 * The old router guessed from the command text — a tier-3 word, a length
 * threshold, or literally the word "and" bought the premium model. That is
 * keyword detection: it charged for "compare apples and oranges" and it
 * misses genuinely hard work phrased simply. Text length and vocabulary
 * measure how someone types, not how hard their problem is.
 *
 * What replaces it:
 *
 *  1. Every call site declares WHAT KIND of work it is (`AiTask`). The kind
 *     of work is a fact about the code path — extraction is extraction no
 *     matter how the goal was worded — so this can't be gamed by phrasing
 *     and can't misfire on it either.
 *  2. Each kind has a floor tier. Everything the product does today —
 *     classification, extraction, summaries, bounded 5-proposal planning —
 *     is work the default model completes correctly, so the floor is
 *     "default" across the board.
 *  3. The only path to the premium model is `escalationFor`: the default
 *     model actually failed to produce usable output, the caller is about to
 *     retry, and the user's plan includes the stronger model. A failed cheap
 *     call is the one honest signal that a task "genuinely requires more
 *     reasoning" — everything else is guessing at margin's expense.
 */

export type AiTask =
  | "plan" // turn a command into bounded action proposals
  | "extract" // pull structured facts out of provided material
  | "classify" // pick a label from a fixed set
  | "summarize" // condense provided content
  | "generate"; // produce prose/content for a deliverable

/**
 * Floor tier per task kind. All "default" today, deliberately: the premium
 * model is an escalation path, not a starting point. If a future task kind
 * (whole-file code generation, long multi-step planning) demonstrably fails
 * on the default model, IT gets a "premium" floor here — one line, reviewed,
 * with the evidence in the commit message.
 */
const FLOOR: Record<AiTask, PlannerTier> = {
  plan: "default",
  extract: "default",
  classify: "default",
  summarize: "default",
  generate: "default",
};

/** The model a task starts on. */
export function modelFor(task: AiTask): string {
  return plannerModel(FLOOR[task]);
}

/**
 * The model for a RETRY after the default model failed to produce usable
 * output. Premium only when the plan carries it and a premium model is
 * actually configured; otherwise the same default model again (a retry on the
 * same model still often succeeds — provider hiccups outnumber hard tasks).
 */
export function escalationFor(
  task: AiTask,
  opts: { strongerModel: boolean; userId: string }
): { model: string; escalated: boolean } {
  const premium = opts.strongerModel ? plannerModel("premium") : "";
  if (premium) {
    // Escalations are expected to be rare; each one is logged so an anomaly
    // (a task kind escalating constantly) is visible in the ledger.
    logInfo("model_escalated", { userId: opts.userId, task });
    return { model: premium, escalated: true };
  }
  return { model: modelFor(task), escalated: false };
}
