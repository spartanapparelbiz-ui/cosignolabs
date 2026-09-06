import { logError, newRequestId } from "../log";
import type {
  ComputerActionInput,
  ComputerActionOutcome,
  ComputerProvider,
  ComputerSessionHandle,
  ScreenObservation,
} from "./provider";

/**
 * The real computer environment, reached over HTTP.
 *
 * Provider-neutral by construction: the contract below is a small JSON API
 * (`/sessions`, `/sessions/:id/observe`, `/sessions/:id/act`) that a hosted
 * desktop service, a container with a display, or a paired agent on the
 * user's own machine can all satisfy. Swapping vendors is a URL change.
 *
 * Until COMPUTER_PROVIDER_URL and COMPUTER_PROVIDER_KEY are both set this
 * reports itself unconfigured, and the computer tools disappear from the
 * capability manifest. It never falls back to the sandbox behind the user's
 * back: a mission either drives a real machine or cannot be planned at all.
 */

const TIMEOUT_MS = Number(process.env.COMPUTER_PROVIDER_TIMEOUT_MS || 30_000);

function baseUrl(): string {
  return (process.env.COMPUTER_PROVIDER_URL || "").trim().replace(/\/+$/, "");
}

function apiKey(): string {
  return (process.env.COMPUTER_PROVIDER_KEY || "").trim();
}

/** Bound every string the provider hands back, so one screen can't flood a row. */
function bounded(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

function toObservation(raw: unknown): ScreenObservation {
  const r = (raw ?? {}) as Record<string, unknown>;
  const controls = Array.isArray(r.controls) ? r.controls : [];
  return {
    width: typeof r.width === "number" ? r.width : 0,
    height: typeof r.height === "number" ? r.height : 0,
    activeWindow: bounded(r.activeWindow, 200),
    windows: Array.isArray(r.windows)
      ? r.windows.filter((w): w is string => typeof w === "string").slice(0, 40).map((w) => w.slice(0, 200))
      : [],
    // On-screen text is UNTRUSTED and bounded. It is data the mission records,
    // never an instruction it follows.
    visibleText: bounded(r.visibleText, 8000),
    controls: controls
      .slice(0, 100)
      .map((c) => {
        const o = (c ?? {}) as Record<string, unknown>;
        return {
          role: bounded(o.role, 40),
          label: bounded(o.label, 200),
          x: typeof o.x === "number" ? o.x : 0,
          y: typeof o.y === "number" ? o.y : 0,
          enabled: o.enabled !== false,
        };
      })
      .filter((c) => c.label || c.role),
    screenshotRef: typeof r.screenshotRef === "string" ? r.screenshotRef.slice(0, 2000) : undefined,
    warnings: Array.isArray(r.warnings)
      ? r.warnings.filter((w): w is string => typeof w === "string").slice(0, 10)
      : [],
    simulated: false,
  };
}

async function call(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl()}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // The key travels in a header and is never logged, never returned to
        // the browser, and never placed in a mission record.
        Authorization: `Bearer ${apiKey()}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`the computer environment answered ${res.status}.`);
    }
    return (await res.json()) as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
  }
}

export class RemoteComputerProvider implements ComputerProvider {
  key = "remote";
  readonly simulated = false;

  isConfigured(): boolean {
    return Boolean(baseUrl() && apiKey());
  }

  async createSession(args: { objective: string }): Promise<ComputerSessionHandle> {
    const data = await call("/sessions", { objective: args.objective.slice(0, 500) });
    const id = typeof data.id === "string" ? data.id : "";
    if (!id) throw new Error("the computer environment didn't return a session.");
    return { providerRef: id, provider: this.key, simulated: false };
  }

  async observe(handle: ComputerSessionHandle): Promise<ScreenObservation> {
    const data = await call(`/sessions/${encodeURIComponent(handle.providerRef)}/observe`, {});
    return toObservation(data.observation ?? data);
  }

  async act(
    handle: ComputerSessionHandle,
    action: ComputerActionInput
  ): Promise<ComputerActionOutcome> {
    const data = await call(`/sessions/${encodeURIComponent(handle.providerRef)}/act`, {
      kind: action.kind,
      target: action.target,
      value: action.value,
      x: action.x,
      y: action.y,
    });
    return {
      ok: data.ok !== false,
      summary: bounded(data.summary, 500) || `${action.kind} ran.`,
      observation: data.observation ? toObservation(data.observation) : undefined,
      simulated: false,
    };
  }

  async destroySession(handle: ComputerSessionHandle): Promise<void> {
    // A session that outlives its mission is a machine left unlocked, so a
    // teardown failure is logged rather than swallowed — but it never fails
    // the mission, which has already finished its work by this point.
    await call(`/sessions/${encodeURIComponent(handle.providerRef)}/destroy`, {}).catch((err) => {
      logError(newRequestId(), err, { event: "computer_session_teardown_failed" });
    });
  }
}
