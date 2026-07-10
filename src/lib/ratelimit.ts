import { logSecurity } from "./log";

/**
 * Rate limiting. Production uses Upstash Redis (@upstash/ratelimit sliding
 * window) so limits hold across serverless instances. Without Upstash env
 * vars (local dev / CI) an in-memory sliding window with identical
 * semantics is used. Limits:
 *   command  10/min + 100/day per user   (each command is a planner call)
 *   transition 30/min per user           (approve / veto / edit)
 *   beta       3/hour per IP
 * plus a global daily planning budget as the circuit breaker.
 */

export interface LimitResult {
  success: boolean;
  /** Seconds until the window resets (for Retry-After). */
  retryAfter: number;
}

interface Limiter {
  limit(key: string): Promise<LimitResult>;
}

class MemorySlidingWindow implements Limiter {
  private hits = new Map<string, number[]>();
  constructor(
    private max: number,
    private windowMs: number
  ) {}

  async limit(key: string): Promise<LimitResult> {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    const arr = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (arr.length >= this.max) {
      this.hits.set(key, arr);
      return {
        success: false,
        retryAfter: Math.max(1, Math.ceil((arr[0] + this.windowMs - now) / 1000)),
      };
    }
    arr.push(now);
    this.hits.set(key, arr);
    return { success: true, retryAfter: 0 };
  }

  reset() {
    this.hits.clear();
  }
}

function upstashConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

type Window = { max: number; windowMs: number; upstashWindow: `${number} ${"s" | "m" | "h" | "d"}` };

const WINDOWS = {
  commandMinute: { max: 10, windowMs: 60_000, upstashWindow: "60 s" },
  commandDay: { max: 100, windowMs: 86_400_000, upstashWindow: "1 d" },
  transitionMinute: { max: 30, windowMs: 60_000, upstashWindow: "60 s" },
  betaHour: { max: 3, windowMs: 3_600_000, upstashWindow: "1 h" },
  previewMinute: { max: 20, windowMs: 60_000, upstashWindow: "60 s" },
  // Analytics beacon (§9) — its own window so a burst of events can never
  // starve the sandbox's budget (or vice versa). Generous; drops silently.
  trackMinute: { max: 60, windowMs: 60_000, upstashWindow: "60 s" },
} satisfies Record<string, Window>;

const LIMIT_MESSAGES: Record<LimitName, string> = {
  commandMinute:
    "you're moving fast — planning is limited to 10 commands a minute.",
  commandDay: "you've hit today's command limit. it resets tomorrow.",
  transitionMinute: "you're moving fast — try that again in a few seconds.",
  betaHour:
    "a few applications already came from this connection — try again in an hour.",
  previewMinute: "the sandbox needs a breather — try again in a minute.",
  trackMinute: "", // beacon is silent — this message is never surfaced.
};

export type LimitName = keyof typeof WINDOWS;

interface Registry {
  limiters: Partial<Record<LimitName, Limiter>>;
  memory: Partial<Record<LimitName, MemorySlidingWindow>>;
  globalCount: { day: string; count: number };
}

const registry = (globalThis as unknown as { __cosignoLimits?: Registry })
  .__cosignoLimits ?? {
  limiters: {},
  memory: {},
  globalCount: { day: "", count: 0 },
};
(globalThis as unknown as { __cosignoLimits?: Registry }).__cosignoLimits = registry;

async function buildUpstash(name: LimitName): Promise<Limiter> {
  const { Ratelimit } = await import("@upstash/ratelimit");
  const { Redis } = await import("@upstash/redis");
  const w = WINDOWS[name];
  const rl = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(w.max, w.upstashWindow),
    prefix: `cosigno:${name}`,
  });
  return {
    async limit(key: string) {
      const res = await rl.limit(key);
      return {
        success: res.success,
        retryAfter: Math.max(1, Math.ceil((res.reset - Date.now()) / 1000)),
      };
    },
  };
}

async function getLimiter(name: LimitName): Promise<Limiter> {
  if (!registry.limiters[name]) {
    if (upstashConfigured()) {
      registry.limiters[name] = await buildUpstash(name);
    } else {
      const mem = new MemorySlidingWindow(WINDOWS[name].max, WINDOWS[name].windowMs);
      registry.memory[name] = mem;
      registry.limiters[name] = mem;
    }
  }
  return registry.limiters[name]!;
}

export class RateLimitError extends Error {
  constructor(
    public limitName: LimitName | "global_budget",
    public retryAfter: number,
    message: string
  ) {
    super(message);
  }
}

/** Throws RateLimitError (mapped to HTTP 429) when the window is exhausted. */
export async function enforceLimit(name: LimitName, key: string): Promise<void> {
  const limiter = await getLimiter(name);
  const res = await limiter.limit(key);
  if (!res.success) {
    logSecurity("rate_limited", { limit: name, key });
    throw new RateLimitError(name, res.retryAfter, LIMIT_MESSAGES[name]);
  }
}

/**
 * Global circuit breaker: bounds total daily planner invocations across
 * ALL users, so even a per-user-limit bypass has a hard ceiling. Uses a
 * Redis daily counter when Upstash is configured, else process memory.
 */
export async function enforceGlobalPlanningBudget(): Promise<void> {
  // Hard daily ceiling on total planner (spend) calls across ALL users.
  // DAILY_PLAN_CAP is the canonical env var; COSIGNO_GLOBAL_DAILY_PLANS is
  // still read for backward-compat. Default 500 — a sane beta ceiling.
  const cap = Number(
    process.env.DAILY_PLAN_CAP || process.env.COSIGNO_GLOBAL_DAILY_PLANS || 500
  );
  const day = new Date().toISOString().slice(0, 10);

  let count: number;
  if (upstashConfigured()) {
    const { Redis } = await import("@upstash/redis");
    const redis = Redis.fromEnv();
    const key = `cosigno:global:plans:${day}`;
    count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 60 * 60 * 25);
  } else {
    if (registry.globalCount.day !== day) {
      registry.globalCount.day = day;
      registry.globalCount.count = 0;
    }
    count = ++registry.globalCount.count;
  }

  if (count > cap) {
    logSecurity("global_budget_hit", { day, count, cap });
    throw new RateLimitError(
      "global_budget",
      3600,
      "cosigno reached today's beta capacity. your commands are safe — try again tomorrow."
    );
  }
}

/** Test hook: clears in-memory windows and the global counter. */
export function resetRateLimitsForTests(): void {
  Object.values(registry.memory).forEach((m) => m?.reset());
  registry.limiters = {};
  registry.memory = {};
  registry.globalCount = { day: "", count: 0 };
}
