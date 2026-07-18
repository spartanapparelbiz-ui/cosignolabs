import type {
  BusinessAreaKey,
  BusinessSnapshot,
  MetricPoint,
  SeriesMap,
} from "./types";

/**
 * The sample business — a deterministic 90-day dataset used until live
 * metric readers are connected. It is ALWAYS labeled data_source: "sample"
 * and rendered with a sample chip; it never impersonates the user's real
 * numbers. The shape is deliberately eventful so every part of the engine
 * (drops, rising refunds, a decaying campaign, a surging product, stale
 * leads, creeping expenses) has something honest to say about it.
 *
 * Values depend only on the day INDEX (0..89), never on the calendar date,
 * so the same story is told no matter when the snapshot is built — and the
 * engine tests are exactly reproducible.
 */

const DAYS = 90;

/** mulberry32 — tiny deterministic PRNG, seeded per metric. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isoDay(asOf: Date, daysAgo: number): string {
  const d = new Date(asOf.getTime() - daysAgo * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** Build one series from a per-index value function, oldest day first. */
function series(asOf: Date, value: (i: number, noise: () => number) => number, seed: number): MetricPoint[] {
  const noise = rng(seed);
  const out: MetricPoint[] = [];
  for (let i = 0; i < DAYS; i++) {
    // i = 0 is the OLDEST day; the last point is yesterday relative to asOf.
    out.push({
      date: isoDay(asOf, DAYS - i),
      value: Math.max(0, Math.round(value(i, noise) * 100) / 100),
    });
  }
  return out;
}

/** Mild weekly seasonality — weekends softer than midweek. */
function weekly(i: number): number {
  return 1 + 0.12 * Math.sin(((i % 7) / 7) * Math.PI * 2);
}

function buildSeries(asOf: Date): SeriesMap {
  return {
    // Steady growth for ~11 weeks, then a clear pullback in the final week:
    // the last 7 days land ~12% below the prior 7.
    revenue: series(
      asOf,
      (i, n) => {
        const base = 2350 + i * 8;
        const dip = i >= DAYS - 7 ? 0.82 : 1;
        return base * weekly(i) * dip * (0.94 + n() * 0.12);
      },
      11
    ),
    orders: series(
      asOf,
      (i, n) => {
        const base = 34 + i * 0.1;
        const dip = i >= DAYS - 7 ? 0.85 : 1;
        return base * weekly(i) * dip * (0.92 + n() * 0.16);
      },
      12
    ),
    // Refunds run ~2.5% of revenue, then roughly double across the last 10 days.
    refunds: series(
      asOf,
      (i, n) => {
        const base = 68;
        const rise = i >= DAYS - 10 ? 1 + ((i - (DAYS - 10)) / 10) * 1.4 : 1;
        return base * rise * (0.8 + n() * 0.4);
      },
      13
    ),
    new_customers: series(
      asOf,
      (i, n) => {
        const base = 16 + i * 0.05;
        const dip = i >= DAYS - 7 ? 0.88 : 1;
        return base * weekly(i) * dip * (0.9 + n() * 0.2);
      },
      14
    ),
    // Churn slowly improving — retention is a bright spot.
    churned_customers: series(asOf, (i, n) => (4.6 - i * 0.02) * (0.8 + n() * 0.4), 15),
    sessions: series(asOf, (i, n) => (1900 + i * 6) * weekly(i) * (0.93 + n() * 0.14), 16),
    // Spend keeps climbing through the final week even as conversions sag —
    // the paid-acquisition efficiency story (CAC ~ $31 → ~$47).
    ad_spend: series(
      asOf,
      (i, n) => {
        const base = 430 + i * 1.6;
        const push = i >= DAYS - 7 ? 1.18 : 1;
        return base * push * (0.95 + n() * 0.1);
      },
      17
    ),
    conversions: series(
      asOf,
      (i, n) => {
        const base = 15 + i * 0.03;
        const sag = i >= DAYS - 7 ? 0.72 : 1;
        return base * sag * (0.9 + n() * 0.2);
      },
      18
    ),
    // Expenses creep up faster than the recent revenue trend — a runway watch.
    expenses: series(asOf, (i, n) => (1980 + i * 6.5) * (0.97 + n() * 0.06), 19),
  };
}

const SAMPLE_SYSTEMS: Record<BusinessAreaKey, string[]> = {
  marketing: ["Meta Ads", "Google Ads", "Google Analytics"],
  sales: ["HubSpot", "Gmail"],
  operations: ["Shopify", "Notion"],
  finance: ["Stripe", "QuickBooks"],
  support: ["Gmail", "Slack"],
  products: ["Shopify"],
};

/**
 * Build the sample snapshot as of `now`. `connectedSystems`, when present,
 * replaces the sample system lists for areas the user has real connections
 * feeding (the map then shows their actual tools).
 */
export function sampleSnapshot(
  now: Date,
  connectedSystems?: Partial<Record<BusinessAreaKey, string[]>>
): BusinessSnapshot {
  const systems = { ...SAMPLE_SYSTEMS };
  for (const [area, tools] of Object.entries(connectedSystems ?? {})) {
    if (tools && tools.length > 0) systems[area as BusinessAreaKey] = tools;
  }

  return {
    data_source: "sample",
    as_of: now.toISOString(),
    currency: "USD",
    business_name: "Sample business",
    cash_on_hand: 148_000,
    monthly_target: 100_000,
    series: buildSeries(now),
    leads: [
      { id: "l1", name: "Northgate Athletics", value: 18_500, stage: "Proposal sent", last_touch_days: 12 },
      { id: "l2", name: "Ridgeline Outfitters", value: 12_000, stage: "Negotiation", last_touch_days: 9 },
      { id: "l3", name: "Harbor Run Club", value: 9_400, stage: "Demo done", last_touch_days: 11 },
      { id: "l4", name: "Summit CrossFit", value: 8_200, stage: "Proposal sent", last_touch_days: 8 },
      { id: "l5", name: "Ironworks Gym Group", value: 7_800, stage: "Qualified", last_touch_days: 10 },
      { id: "l6", name: "Pace Setter Events", value: 6_500, stage: "Demo done", last_touch_days: 13 },
      { id: "l7", name: "Valley Soccer League", value: 5_900, stage: "Qualified", last_touch_days: 7 },
      { id: "l8", name: "Blue Oak Corporate", value: 5_200, stage: "Proposal sent", last_touch_days: 9 },
      { id: "l9", name: "Fairview Schools", value: 4_100, stage: "Negotiation", last_touch_days: 2 },
      { id: "l10", name: "Delta Esports", value: 3_600, stage: "Qualified", last_touch_days: 1 },
    ],
    campaigns: [
      {
        id: "c1",
        name: "Prospecting — Meta",
        channel: "Meta Ads",
        spend_7d: 1_880,
        conversions_7d: 40,
        spend_prev_7d: 1_550,
        conversions_prev_7d: 50,
      },
      {
        id: "c2",
        name: "Brand search — Google",
        channel: "Google Ads",
        spend_7d: 620,
        conversions_7d: 31,
        spend_prev_7d: 600,
        conversions_prev_7d: 30,
      },
      {
        id: "c3",
        name: "Retargeting — Meta",
        channel: "Meta Ads",
        spend_7d: 540,
        conversions_7d: 36,
        spend_prev_7d: 520,
        conversions_prev_7d: 28,
      },
    ],
    products: [
      {
        id: "p1",
        name: "Fleece training hoodie",
        units_14d: 540,
        units_prev_14d: 370,
        revenue_14d: 29_700,
        organic_share_delta: 0.34,
      },
      {
        id: "p2",
        name: "Performance tee",
        units_14d: 780,
        units_prev_14d: 810,
        revenue_14d: 19_500,
        organic_share_delta: -0.02,
      },
      {
        id: "p3",
        name: "Track shorts",
        units_14d: 300,
        units_prev_14d: 320,
        revenue_14d: 9_300,
        organic_share_delta: 0.01,
      },
    ],
    support: [
      { id: "s1", topic: "Sizing runs small", tickets_7d: 22, tickets_prev_7d: 9 },
      { id: "s2", topic: "Where is my order", tickets_7d: 14, tickets_prev_7d: 12 },
      { id: "s3", topic: "Return requests", tickets_7d: 11, tickets_prev_7d: 6 },
    ],
    systems,
  };
}
