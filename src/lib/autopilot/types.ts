/**
 * Business Autopilot — the intelligence layer that watches the business,
 * detects what changed, scores health, forecasts, and recommends what should
 * happen next. Autopilot NEVER executes: every recommended action routes into
 * the existing Operator pipeline where approval-first rules apply unchanged.
 *
 * Everything here is computed from a BusinessSnapshot by pure functions
 * (src/lib/autopilot/*). The snapshot carries an explicit data_source label:
 * "sample" data is always presented as sample — never as the user's real
 * numbers (the no-fake-metrics rule).
 */

/** One daily observation of a metric. date is an ISO day (YYYY-MM-DD). */
export interface MetricPoint {
  date: string;
  value: number;
}

/** The daily series Autopilot reasons over. All money values are USD dollars. */
export interface SeriesMap {
  /** Gross revenue per day. */
  revenue: MetricPoint[];
  /** Orders per day. */
  orders: MetricPoint[];
  /** Refund amount per day. */
  refunds: MetricPoint[];
  /** New customers per day. */
  new_customers: MetricPoint[];
  /** Customers lost per day. */
  churned_customers: MetricPoint[];
  /** Site sessions per day. */
  sessions: MetricPoint[];
  /** Paid ad spend per day (all channels). */
  ad_spend: MetricPoint[];
  /** Paid conversions per day. */
  conversions: MetricPoint[];
  /** Operating expenses per day. */
  expenses: MetricPoint[];
}

export type MetricKey = keyof SeriesMap;

/** A sales opportunity Autopilot watches for inactivity. */
export interface LeadEntity {
  id: string;
  name: string;
  /** Estimated deal value in dollars. */
  value: number;
  stage: string;
  /** Days since the last touch (email, call, meeting). */
  last_touch_days: number;
}

/** A paid campaign with a current and prior 7-day window. */
export interface CampaignEntity {
  id: string;
  name: string;
  channel: string;
  spend_7d: number;
  conversions_7d: number;
  spend_prev_7d: number;
  conversions_prev_7d: number;
}

/** A product with a current and prior 14-day window. */
export interface ProductEntity {
  id: string;
  name: string;
  units_14d: number;
  units_prev_14d: number;
  revenue_14d: number;
  /** Change in the organic-traffic share of this product's sessions (fraction). */
  organic_share_delta: number;
}

/** A recurring support theme. */
export interface SupportTopic {
  id: string;
  topic: string;
  tickets_7d: number;
  tickets_prev_7d: number;
}

export type BusinessAreaKey =
  | "marketing"
  | "sales"
  | "operations"
  | "finance"
  | "support"
  | "products";

/**
 * The whole picture Autopilot reasons over. data_source is load-bearing:
 * "sample" snapshots are labeled sample in every surface that renders them.
 */
export interface BusinessSnapshot {
  data_source: "sample" | "live";
  /** ISO timestamp the snapshot describes ("now" for the engine). */
  as_of: string;
  currency: "USD";
  business_name: string;
  cash_on_hand: number;
  /** Monthly revenue target the forecast is measured against. */
  monthly_target: number;
  series: SeriesMap;
  leads: LeadEntity[];
  campaigns: CampaignEntity[];
  products: ProductEntity[];
  support: SupportTopic[];
  /** Systems feeding each business area (provider display names). */
  systems: Record<BusinessAreaKey, string[]>;
}

/* ------------------------------------------------------------- signals */

export type SignalSeverity = "critical" | "important" | "opportunity" | "info";

export type SignalKind =
  | "revenue"
  | "customer"
  | "marketing"
  | "sales"
  | "operations"
  | "finance"
  | "opportunity"
  | "risk";

export type Confidence = "high" | "medium" | "low";

/** An operator command a signal or recommendation can hand to the Operator. */
export interface SuggestedAction {
  label: string;
  /** The exact command run through the normal pipeline on "Take action". */
  command: string;
}

/**
 * An important event Autopilot detected. `key` is stable across recomputes of
 * the same condition so user dispositions (ignored) survive refreshes.
 */
export interface Signal {
  key: string;
  kind: SignalKind;
  severity: SignalSeverity;
  title: string;
  /** What happened — plain language, grounded in the snapshot. */
  body: string;
  /** Why it matters. */
  why: string;
  /** Estimated impact, stated with its uncertainty. */
  impact: string;
  confidence: Confidence;
  /** Supporting numbers shown with the signal. */
  metrics: { label: string; value: string }[];
  action: SuggestedAction | null;
}

/** A signal joined with the user's stored disposition. */
export interface SignalView extends Signal {
  status: "new" | "seen" | "ignored" | "actioned";
  first_seen: string;
}

/* -------------------------------------------------------------- health */

export type HealthKey =
  | "revenue"
  | "growth"
  | "cash"
  | "customers"
  | "sales"
  | "marketing"
  | "operations"
  | "team"
  | "risk";

export type HealthStatus =
  | "strong"
  | "healthy"
  | "stable"
  | "improving"
  | "needs_attention"
  | "at_risk"
  | "no_data";

export interface CategoryHealth {
  key: HealthKey;
  label: string;
  status: HealthStatus;
  /** 0..100, or null when there isn't enough data to say. */
  score: number | null;
  /** One-line reasoning, grounded in the evidence below. */
  summary: string;
  evidence: { label: string; value: string }[];
}

export interface BusinessHealth {
  /** Weighted overall score, or null if no category has data. */
  score: number | null;
  label: string;
  categories: CategoryHealth[];
}

/* ------------------------------------------------------------ forecast */

export interface RevenueForecast {
  month: string;
  /** Revenue booked so far this month. */
  month_to_date: number;
  /** Central projection for the full month. */
  projection: number;
  /** Honest range around the projection. */
  low: number;
  high: number;
  target: number;
  /** projection - target (negative = miss). */
  gap: number;
  on_track: boolean;
  confidence: Confidence;
  /** The main drivers behind the trajectory. */
  causes: string[];
  note: string;
}

/* ------------------------------------------------------- recommendations */

export interface Recommendation {
  key: string;
  title: string;
  /** Why now — grounded in current conditions. */
  reason: string;
  impact: string;
  confidence: Confidence;
  action: SuggestedAction;
}

/* --------------------------------------------------------- business map */

export interface FunnelStage {
  key: "traffic" | "leads" | "customers" | "revenue" | "retention";
  label: string;
  /** Current 7-day figure, formatted. */
  value: string;
  /** Week-over-week change, formatted with sign (or null when unknowable). */
  change: string | null;
  trend: "up" | "down" | "flat";
}

export interface BusinessArea {
  key: BusinessAreaKey;
  label: string;
  status: HealthStatus;
  summary: string;
  systems: string[];
}

export interface BusinessMap {
  funnel: FunnelStage[];
  areas: BusinessArea[];
}

/* ---------------------------------------------------------- daily brief */

export interface DailyBrief {
  greeting: string;
  date: string;
  lines: {
    kind: "metric" | "signal" | "opportunity" | "attention" | "priority";
    label: string;
    text: string;
  }[];
}

/* --------------------------------------------------------- what changed */

export interface ChangeItem {
  key: string;
  text: string;
  /** Whether this reads as good, bad, or neutral news. */
  tone: "positive" | "negative" | "neutral";
}

/* ------------------------------------------------------------ ask cosigno */

export interface AskAnswer {
  question: string;
  answer: string;
  evidence: string[];
  metrics: { label: string; value: string }[];
  confidence: Confidence;
  next_step: string;
  action: SuggestedAction | null;
}

/* ------------------------------------------------------------- overview */

/**
 * Autopilot has nothing to read: no connected source is producing business
 * metrics yet. It reports that and stops — it does not stand in a sample
 * business, and it does not offer recommendations it has no basis for.
 */
export interface AutopilotEmpty {
  data_source: "none";
  as_of: string;
}

/** Everything the Autopilot page renders, assembled server-side. */
export interface AutopilotReading {
  data_source: "live";
  business_name: string;
  as_of: string;
  brief: DailyBrief;
  changes: ChangeItem[];
  health: BusinessHealth;
  /** Priority queue: critical/important signals not ignored. */
  attention: SignalView[];
  /** Positive signals. */
  opportunities: SignalView[];
  /** Full signal feed (including ignored, flagged as such). */
  signals: SignalView[];
  forecast: RevenueForecast;
  map: BusinessMap;
  recommendations: Recommendation[];
}

/**
 * Discriminated on data_source so a surface cannot read a metric off an
 * overview that has no data behind it — the compiler stops it.
 */
export type AutopilotOverview = AutopilotEmpty | AutopilotReading;
