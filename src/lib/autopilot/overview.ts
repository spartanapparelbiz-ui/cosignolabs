import { getStore } from "../store";
import { askAutopilot } from "./ask";
import { computeForecast } from "./forecast";
import { computeHealth } from "./health";
import { computeBrief, computeChanges, computeRecommendations } from "./insights";
import { computeMap } from "./map";
import { detectSignals } from "./signals";
import type {
  AskAnswer,
  AutopilotOverview,
  BusinessSnapshot,
  Signal,
  SignalView,
} from "./types";

/**
 * Assembles everything the Autopilot surfaces render. The engine itself is
 * pure; this module is the only place Autopilot touches the store (signal
 * dispositions + the last-viewed marker).
 *
 * DATA SOURCE, honestly: no live metric reader exists yet for revenue/ads/CRM
 * providers, so there is no snapshot to reason over and Autopilot reports
 * exactly that. It does NOT stand a sample business in the gap. A person
 * opening a new account sees an empty account — no invented history, no
 * scores computed from numbers that were never theirs, and no recommended
 * actions derived from them. buildSnapshot() is the one seam to swap when
 * live readers land; everything downstream already works, and the engine
 * stays covered by tests against the sample fixture in ./sample.
 */

/**
 * The user's real business metrics, or null when nothing is producing any.
 * Returns null unconditionally today — there is no reader to call yet.
 */
async function buildSnapshot(_userId: string, _now: Date): Promise<BusinessSnapshot | null> {
  return null;
}

function joinStates(
  signals: Signal[],
  states: { signal_key: string; status: SignalView["status"]; first_seen: string }[]
): SignalView[] {
  const byKey = new Map(states.map((s) => [s.signal_key, s]));
  return signals.map((sig) => {
    const st = byKey.get(sig.key);
    return {
      ...sig,
      status: st?.status ?? "new",
      first_seen: st?.first_seen ?? new Date().toISOString(),
    };
  });
}

export interface OverviewOptions {
  now?: Date;
  firstName?: string | null;
  /** Flip "new" signals to "seen" AFTER computing (so this view still shows them as new). */
  markSeen?: boolean;
}

export async function buildOverview(
  userId: string,
  opts: OverviewOptions = {}
): Promise<AutopilotOverview> {
  const now = opts.now ?? new Date();
  const store = getStore();

  const snapshot = await buildSnapshot(userId, now);
  // Nothing is feeding Autopilot. Say so and return — do not run the engine
  // over an invented business just to have something on the page.
  if (!snapshot) return { data_source: "none", as_of: now.toISOString() };

  const signals = detectSignals(snapshot);
  const states = await store.ensureSignalStates(userId, signals.map((s) => s.key));
  const views = joinStates(signals, states);

  const health = computeHealth(snapshot);
  const forecast = computeForecast(snapshot, signals);
  const map = computeMap(snapshot, health);
  const recommendations = computeRecommendations(signals, forecast);
  const changes = computeChanges(snapshot, signals);

  const active = views.filter((v) => v.status !== "ignored");
  const attention = active.filter(
    (v) => v.severity === "critical" || v.severity === "important"
  );
  const opportunities = active.filter(
    (v) => v.severity === "opportunity" || v.severity === "info"
  );

  const brief = computeBrief(snapshot, signals, attention.length, opts.firstName);

  if (opts.markSeen) {
    await store.markSignalsSeen(userId);
    await store.setAutopilotViewedAt(userId, now.toISOString());
  }

  return {
    data_source: "live",
    business_name: snapshot.business_name,
    as_of: snapshot.as_of,
    brief,
    changes,
    health,
    attention,
    opportunities,
    signals: views,
    forecast,
    map,
    recommendations,
  };
}

/** Answer a business question with the same grounded pieces the page shows. */
export async function answerQuestion(
  userId: string,
  question: string,
  now = new Date()
): Promise<AskAnswer> {
  const snapshot = await buildSnapshot(userId, now);
  if (!snapshot) {
    // An answer with no data behind it would be a guess wearing a suit.
    return {
      question,
      answer:
        "I can't answer that yet — nothing is reporting your business numbers to me.",
      evidence: [],
      metrics: [],
      confidence: "low",
      next_step:
        "Connect the tools that hold your revenue, customer, and support data, and I'll answer from those.",
      action: null,
    };
  }
  const signals = detectSignals(snapshot);
  const health = computeHealth(snapshot);
  const forecast = computeForecast(snapshot, signals);
  return askAutopilot(question, snapshot, signals, health, forecast);
}
