import { getStore } from "../store";
import { askAutopilot } from "./ask";
import { computeForecast } from "./forecast";
import { computeHealth } from "./health";
import { computeBrief, computeChanges, computeRecommendations } from "./insights";
import { computeMap } from "./map";
import { sampleSnapshot } from "./sample";
import { detectSignals } from "./signals";
import type {
  AskAnswer,
  AutopilotOverview,
  BusinessAreaKey,
  BusinessSnapshot,
  Signal,
  SignalView,
} from "./types";

/**
 * Assembles everything the Autopilot surfaces render. The engine itself is
 * pure; this module is the only place Autopilot touches the store (signal
 * dispositions + the last-viewed marker) and the user's connections (which
 * real tools feed each business area on the map).
 *
 * DATA SOURCE, honestly: until live metric readers exist for revenue/ads/CRM
 * providers, the snapshot is the labeled SAMPLE business — every payload
 * carries data_source: "sample" and the UI shows it. Connected apps do flow
 * into the Business Map's systems, so the map reflects the user's real
 * stack. When live readers land, buildSnapshot() is the one seam to swap.
 */

/** Which business area each connectable provider feeds. */
const PROVIDER_AREAS: Record<string, BusinessAreaKey[]> = {
  gmail: ["sales", "support"],
  outlook: ["sales", "support"],
  slack: ["support", "operations"],
  notion: ["operations"],
  "google-calendar": ["operations"],
  "google-drive": ["operations"],
  github: ["products"],
};

async function connectedSystems(
  userId: string
): Promise<Partial<Record<BusinessAreaKey, string[]>>> {
  const out: Partial<Record<BusinessAreaKey, string[]>> = {};
  try {
    const connections = await getStore().listConnections(userId);
    for (const c of connections) {
      if (c.status !== "connected") continue;
      for (const area of PROVIDER_AREAS[c.provider_key] ?? []) {
        (out[area] ??= []).push(c.display_name);
      }
    }
  } catch {
    // Connections are enrichment for the map — never fail the overview on them.
  }
  return out;
}

async function buildSnapshot(userId: string, now: Date): Promise<BusinessSnapshot> {
  return sampleSnapshot(now, await connectedSystems(userId));
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
    data_source: snapshot.data_source,
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
  const signals = detectSignals(snapshot);
  const health = computeHealth(snapshot);
  const forecast = computeForecast(snapshot, signals);
  return askAutopilot(question, snapshot, signals, health, forecast);
}
