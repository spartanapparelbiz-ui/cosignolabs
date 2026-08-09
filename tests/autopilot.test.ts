import { beforeEach, describe, expect, it } from "vitest";
import { askAutopilot } from "../src/lib/autopilot/ask";
import { computeForecast } from "../src/lib/autopilot/forecast";
import { computeHealth } from "../src/lib/autopilot/health";
import {
  computeBrief,
  computeChanges,
  computeRecommendations,
} from "../src/lib/autopilot/insights";
import { computeMap } from "../src/lib/autopilot/map";
import { answerQuestion, buildOverview } from "../src/lib/autopilot/overview";
import { sampleSnapshot } from "../src/lib/autopilot/sample";
import { detectSignals } from "../src/lib/autopilot/signals";
import { runAutomation } from "../src/lib/automations";
import { MemoryStore } from "../src/lib/store/memory";
import type { AutomationRecord } from "../src/lib/types";

const USER = "test-user";
const NOW = new Date("2026-07-15T09:00:00.000Z");

function freshStore(): MemoryStore {
  const store = new MemoryStore();
  (globalThis as unknown as { __cosignoStore?: unknown }).__cosignoStore = store;
  return store;
}

beforeEach(() => {
  freshStore();
});

describe("sample snapshot", () => {
  it("is deterministic: identical numbers regardless of the as-of date", () => {
    const a = sampleSnapshot(new Date("2026-07-15T09:00:00Z"));
    const b = sampleSnapshot(new Date("2026-09-03T22:00:00Z"));
    expect(a.series.revenue.map((p) => p.value)).toEqual(b.series.revenue.map((p) => p.value));
    expect(a.series.refunds.map((p) => p.value)).toEqual(b.series.refunds.map((p) => p.value));
  });

  it("is always labeled sample — never impersonates live data", () => {
    expect(sampleSnapshot(NOW).data_source).toBe("sample");
  });
});

describe("signal detection", () => {
  const snapshot = sampleSnapshot(NOW);
  const signals = detectSignals(snapshot);
  const keys = signals.map((s) => s.key);

  it("detects the sample business's engineered conditions", () => {
    expect(keys).toContain("revenue_week_drop");
    expect(keys).toContain("cac_rise");
    expect(keys).toContain("refunds_rising");
    expect(keys).toContain("stale_leads");
    expect(keys).toContain("product_surge_p1");
    expect(keys).toContain("support_recurring_s1");
    expect(keys).toContain("retention_improving");
  });

  it("orders by severity and grounds every signal in metrics", () => {
    const order = { critical: 0, important: 1, opportunity: 2, info: 3 };
    for (let i = 1; i < signals.length; i++) {
      expect(order[signals[i].severity]).toBeGreaterThanOrEqual(order[signals[i - 1].severity]);
    }
    for (const s of signals) {
      expect(s.metrics.length).toBeGreaterThan(0);
      expect(s.why.length).toBeGreaterThan(0);
      expect(s.impact.length).toBeGreaterThan(0);
    }
  });

  it("actionable signals carry an operator command (approval-first door)", () => {
    const stale = signals.find((s) => s.key === "stale_leads")!;
    expect(stale.action).not.toBeNull();
    expect(stale.action!.command.toLowerCase()).toContain("review");
  });
});

describe("business health", () => {
  const snapshot = sampleSnapshot(NOW);
  const health = computeHealth(snapshot);

  it("scores overall from real category scores, 0..100", () => {
    expect(health.score).not.toBeNull();
    expect(health.score!).toBeGreaterThanOrEqual(0);
    expect(health.score!).toBeLessThanOrEqual(100);
    expect(health.categories).toHaveLength(9);
  });

  it("says 'no data' honestly instead of inventing a number", () => {
    const team = health.categories.find((c) => c.key === "team")!;
    expect(team.status).toBe("no_data");
    expect(team.score).toBeNull();
  });

  it("every scored category explains itself with evidence", () => {
    for (const c of health.categories) {
      if (c.score !== null) {
        expect(c.summary.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("forecast", () => {
  const snapshot = sampleSnapshot(NOW);
  const signals = detectSignals(snapshot);
  const forecast = computeForecast(snapshot, signals);

  it("projects within its own honest range and never claims certainty", () => {
    expect(forecast.projection).toBeGreaterThanOrEqual(forecast.low);
    expect(forecast.projection).toBeLessThanOrEqual(forecast.high);
    expect(forecast.note.toLowerCase()).toContain("estimate");
  });

  it("derives causes from live signals, not generic filler", () => {
    for (const cause of forecast.causes) {
      expect(signals.some((s) => s.title === cause)).toBe(true);
    }
  });
});

describe("map, changes, recommendations, brief", () => {
  const snapshot = sampleSnapshot(NOW);
  const signals = detectSignals(snapshot);
  const health = computeHealth(snapshot);
  const forecast = computeForecast(snapshot, signals);

  it("maps the funnel plus six business areas with systems", () => {
    const map = computeMap(snapshot, health);
    expect(map.funnel.map((f) => f.key)).toEqual([
      "traffic",
      "leads",
      "customers",
      "revenue",
      "retention",
    ]);
    expect(map.areas).toHaveLength(6);
    for (const a of map.areas) {
      expect(a.systems.length).toBeGreaterThan(0);
    }
  });

  it("keeps 'what changed' focused (max 5 items)", () => {
    const changes = computeChanges(snapshot, signals);
    expect(changes.length).toBeGreaterThan(0);
    expect(changes.length).toBeLessThanOrEqual(5);
  });

  it("recommendations are grounded in signals and capped at 5", () => {
    const recs = computeRecommendations(signals, forecast);
    expect(recs.length).toBeGreaterThan(0);
    expect(recs.length).toBeLessThanOrEqual(5);
    for (const r of recs) {
      expect(r.action.command.length).toBeGreaterThan(0);
    }
  });

  it("brief is short, greets, and names a priority", () => {
    const brief = computeBrief(snapshot, signals, 3, "Nicholas");
    expect(brief.greeting).toContain("Nicholas");
    expect(brief.lines.length).toBeLessThanOrEqual(6);
    expect(brief.lines.some((l) => l.kind === "priority")).toBe(true);
  });
});

describe("ask cosigno (grounded Q&A)", () => {
  const snapshot = sampleSnapshot(NOW);
  const signals = detectSignals(snapshot);
  const health = computeHealth(snapshot);
  const forecast = computeForecast(snapshot, signals);

  function ask(q: string) {
    return askAutopilot(q, snapshot, signals, health, forecast);
  }

  it("answers 'why did revenue drop' with evidence and metrics", () => {
    const a = ask("Why did revenue drop?");
    expect(a.answer.toLowerCase()).toContain("7 days");
    expect(a.metrics.length).toBeGreaterThan(0);
    expect(a.next_step.length).toBeGreaterThan(0);
  });

  it("answers the target question with the forecast's honest range", () => {
    const a = ask("Are we likely to miss our revenue target?");
    expect(a.answer.toLowerCase()).toContain("estimate");
    expect(a.metrics.some((m) => m.label === "Target")).toBe(true);
  });

  it("falls back to what stands out — never generic advice", () => {
    const a = ask("zzz completely unrelated gibberish");
    expect(a.evidence.length).toBeGreaterThan(0);
  });
});

describe("overview assembly: an empty account stays empty", () => {
  /* The engine above is exercised against the sample fixture on purpose. The
     PRODUCT must never serve that fixture: nothing reads live business
     metrics yet, so a person opening Autopilot gets an honest nothing —
     no invented history, no health score, no recommended actions. */

  it("reports no data rather than standing in a sample business", async () => {
    const o = await buildOverview(USER, { now: NOW });
    expect(o.data_source).toBe("none");
  });

  it("carries no metrics, signals, or recommendations of any kind", async () => {
    const o = await buildOverview(USER, { now: NOW });
    // Nothing beyond the "no data" marker and the timestamp may be present —
    // a stray field here is a fabricated number reaching a real user.
    expect(Object.keys(o).sort()).toEqual(["as_of", "data_source"]);
  });

  it("stays empty on every later visit, marked seen or not", async () => {
    await buildOverview(USER, { now: NOW, markSeen: true });
    const next = await buildOverview(USER, { now: NOW });
    expect(next.data_source).toBe("none");
  });

  it("answers a business question with an honest non-answer", async () => {
    const a = await answerQuestion(USER, "how is revenue tracking?", NOW);
    expect(a.evidence).toEqual([]);
    expect(a.metrics).toEqual([]);
    expect(a.action).toBeNull();
    // No number may appear in an answer with no data behind it.
    expect(a.answer).not.toMatch(/\d/);
  });
});

describe("signal dispositions round-trip in the store", () => {
  /* Autopilot has no signals to disposition today, but the machinery is what
     live readers will land on — so it stays covered directly. */

  it("persists a status and reports it back", async () => {
    const store = (globalThis as unknown as { __cosignoStore: MemoryStore }).__cosignoStore;
    const [state] = await store.ensureSignalStates(USER, ["revenue_drop"]);
    expect(state.status).toBe("new");

    await store.setSignalStatus(USER, "revenue_drop", "actioned");
    const [after] = await store.ensureSignalStates(USER, ["revenue_drop"]);
    expect(after.status).toBe("actioned");
  });

  it("marks new signals seen without disturbing actioned ones", async () => {
    const store = (globalThis as unknown as { __cosignoStore: MemoryStore }).__cosignoStore;
    await store.ensureSignalStates(USER, ["a", "b"]);
    await store.setSignalStatus(USER, "a", "actioned");
    await store.markSignalsSeen(USER);

    const states = await store.ensureSignalStates(USER, ["a", "b"]);
    const byKey = new Map(states.map((s) => [s.signal_key, s.status]));
    expect(byKey.get("a")).toBe("actioned");
    expect(byKey.get("b")).toBe("seen");
  });
});

describe("automation modes (approval-first stays the default)", () => {
  async function createAutomation(mode: AutomationRecord["mode"]) {
    const store = (globalThis as unknown as { __cosignoStore: MemoryStore }).__cosignoStore;
    return store.createAutomation({
      user_id: USER,
      name: `${mode} rule`,
      command: "clear my inbox of newsletters",
      interval_hours: 24,
      mode,
      next_run_at: new Date().toISOString(),
    });
  }

  it("monitor: consequential proposals are auto-vetoed with an honest reason", async () => {
    const store = (globalThis as unknown as { __cosignoStore: MemoryStore }).__cosignoStore;
    const automation = await createAutomation("monitor");
    const run = await runAutomation(automation);
    expect(run.status).toBe("ok");
    expect(run.detail).toContain("monitor mode");
    const actions = await store.listActions(USER, {});
    const tier2 = actions.filter((a) => a.tier >= 2);
    expect(tier2.length).toBeGreaterThan(0);
    for (const a of tier2) {
      expect(a.status).toBe("vetoed");
      expect(a.veto_reason).toContain("monitor-only");
    }
  });

  it("prepare (default): proposals wait for a signature, exactly as before", async () => {
    const store = (globalThis as unknown as { __cosignoStore: MemoryStore }).__cosignoStore;
    const automation = await createAutomation("prepare");
    const run = await runAutomation(automation);
    expect(run.status).toBe("ok");
    const actions = await store.listActions(USER, {});
    expect(actions.some((a) => a.tier === 2 && a.status === "proposed")).toBe(true);
  });

  it("execute: tier-2 runs under the rule's explicit grant", async () => {
    const store = (globalThis as unknown as { __cosignoStore: MemoryStore }).__cosignoStore;
    const automation = await createAutomation("execute");
    const run = await runAutomation(automation);
    expect(run.status).toBe("ok");
    const actions = await store.listActions(USER, {});
    const tier2 = actions.filter((a) => a.tier === 2);
    expect(tier2.length).toBeGreaterThan(0);
    expect(tier2.every((a) => a.status === "executed")).toBe(true);
    // The approval row exists — the engine door was used, not bypassed.
    for (const a of tier2) {
      const events = await store.listEvents(USER, a.id);
      expect(events.some((e) => e.type === "approved")).toBe(true);
    }
  });
});
