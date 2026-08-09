"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * One request per fact, shared by everyone who needs it.
 *
 * The workspace was asking the same questions several times per page load:
 * `/api/hold` twice (the banner and the stop button), `/api/actions` twice
 * (the rail badge and the page), `/api/usage` twice, `/api/rules` twice. Each
 * duplicate is a round trip the person waits through for information the app
 * already had in flight.
 *
 * This is a small stale-while-revalidate cache with three properties, and
 * those three are the whole reason the app feels fast:
 *
 *  1. **Dedupe.** Concurrent readers of the same key share ONE request. Ten
 *     components can ask independently; the network sees one.
 *  2. **Instant on return.** A cached value renders immediately — navigating
 *     back to a page you were just on shows content, not a skeleton, and the
 *     refresh happens quietly underneath.
 *  3. **Seedable.** A server component that already fetched something hands it
 *     over (`seedResource`), so the client never re-asks on first paint for
 *     data that arrived in the HTML.
 *
 * Deliberately ~100 lines and dependency-free. This is a cache, not a data
 * layer: no normalisation, no query language, nothing to learn.
 */

interface Entry {
  data?: unknown;
  error?: string;
  /** When `data` was last written (ms epoch). 0 means never. */
  at: number;
  inflight?: Promise<unknown>;
  subscribers: Set<() => void>;
}

/**
 * THE CACHE IS A BROWSER CACHE, AND IT MUST STAY ONE.
 *
 * A "use client" module still executes on the server to produce the SSR HTML,
 * and this Map lives in the Node process — one Map, shared by every request
 * and therefore by every user. Writing to it during a server render is a
 * cross-user data leak: the first request would fill it, and every later
 * request would render the FIRST user's approvals into a different person's
 * HTML. (It also causes a hydration mismatch, which is how it was caught.)
 *
 * So every entry point below is inert on the server. Components pass their
 * server-fetched data as an `initial` prop and fall back to it while the cache
 * is empty — which is exactly the state on the server and during the client's
 * hydration render, so both produce identical markup.
 */
const isBrowser = typeof window !== "undefined";

const cache = new Map<string, Entry>();

/** How long a value is served without a background refresh. */
const DEFAULT_STALE_MS = 10_000;

function entryFor(key: string): Entry {
  let e = cache.get(key);
  if (!e) {
    e = { at: 0, subscribers: new Set() };
    cache.set(key, e);
  }
  return e;
}

function publish(entry: Entry) {
  entry.subscribers.forEach((fn) => fn());
}

async function fetchJson(key: string): Promise<unknown> {
  const res = await fetch(key, { cache: "no-store", headers: { Accept: "application/json" } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (body as { message?: string; error?: string }).message ||
        (body as { error?: string }).error ||
        "something went wrong."
    );
  }
  return body;
}

/**
 * Put a value the server already fetched into the cache, so the client's first
 * render has it and fires no request for it. Never overwrites something newer
 * that the client has since fetched.
 */
export function seedResource(key: string, data: unknown): void {
  if (!isBrowser) return;
  const entry = entryFor(key);
  if (entry.at !== 0) return;
  entry.data = data;
  entry.at = Date.now();
}

/** Read the current cached value without subscribing. */
export function readResource<T>(key: string): T | undefined {
  if (!isBrowser) return undefined;
  return cache.get(key)?.data as T | undefined;
}

/**
 * Write a value straight into the cache and tell every watcher. This is the
 * optimistic-update primitive: after a mutation the app already knows the new
 * answer, so it shows it on the same frame as the click rather than after a
 * round trip that has already succeeded. Callers follow it with `invalidate`
 * when they want the server's version to confirm.
 */
export function setResource(key: string, data: unknown): void {
  if (!isBrowser) return;
  const entry = entryFor(key);
  entry.data = data;
  entry.error = undefined;
  entry.at = Date.now();
  publish(entry);
}

/** Start (or join) a request for `key`, returning the shared promise. */
export function loadResource(key: string): Promise<unknown> {
  if (!isBrowser) return Promise.resolve(undefined);
  const entry = entryFor(key);
  if (entry.inflight) return entry.inflight;
  const p = fetchJson(key)
    .then((data) => {
      entry.data = data;
      entry.error = undefined;
      entry.at = Date.now();
      return data;
    })
    .catch((err: unknown) => {
      entry.error = err instanceof Error ? err.message : "something went wrong.";
      // Keep any previous data: a failed refresh should not blank a page that
      // was already showing something true a moment ago.
      throw err;
    })
    .finally(() => {
      entry.inflight = undefined;
      publish(entry);
    });
  entry.inflight = p;
  return p;
}

/**
 * Mark keys stale and refetch the ones being watched. Pass a prefix to catch a
 * family at once — after approving, `invalidate("/api/actions")` refreshes the
 * queue, the rail badge and the dashboard from one call.
 */
export function invalidate(prefix: string): void {
  if (!isBrowser) return;
  for (const [key, entry] of cache) {
    if (!key.startsWith(prefix)) continue;
    entry.at = 0;
    if (entry.subscribers.size > 0) void loadResource(key).catch(() => undefined);
    else publish(entry);
  }
}

/** Drop everything. Used on sign-out so no data survives into another session. */
export function clearResources(): void {
  cache.clear();
}

export interface ResourceState<T> {
  data: T | undefined;
  error: string | undefined;
  /** True only when there is nothing to show yet — never during a refresh. */
  loading: boolean;
  refresh: () => void;
}

/**
 * Subscribe to a resource. `key` is the URL, and it is also the cache key, so
 * two components asking for the same URL are asking the same question.
 *
 * Pass `key: null` to skip entirely (a conditional fetch without breaking the
 * rules of hooks).
 */
export function useResource<T = unknown>(
  key: string | null,
  opts: {
    /** Poll while the tab is visible. */
    refreshMs?: number;
    /** How long a cached value is served before a background refresh. */
    staleMs?: number;
  } = {}
): ResourceState<T> {
  const { refreshMs, staleMs = DEFAULT_STALE_MS } = opts;
  const [, bump] = useState(0);

  useEffect(() => {
    if (!key) return;
    const entry = entryFor(key);
    const rerender = () => bump((n) => n + 1);
    entry.subscribers.add(rerender);

    // Fetch only if nobody has, or what we hold has gone stale. This is the
    // line that removes the duplicate requests: the second component to mount
    // finds fresh data and asks for nothing.
    if (Date.now() - entry.at > staleMs) void loadResource(key).catch(() => undefined);

    let timer: ReturnType<typeof setInterval> | undefined;
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadResource(key).catch(() => undefined);
    };
    if (refreshMs) {
      // Polling pauses while the tab is hidden — nobody is reading a
      // background tab, and a laptop lid should not mean a request every 30s.
      timer = setInterval(() => {
        if (document.visibilityState === "visible") void loadResource(key).catch(() => undefined);
      }, refreshMs);
      document.addEventListener("visibilitychange", onVisible);
    }

    return () => {
      entry.subscribers.delete(rerender);
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [key, refreshMs, staleMs]);

  const refresh = useCallback(() => {
    if (key) {
      entryFor(key).at = 0;
      void loadResource(key).catch(() => undefined);
    }
  }, [key]);

  // On the server this is always empty (see `isBrowser` above), so the caller
  // falls back to its `initial` prop — and the client's hydration render takes
  // the same path, which is what keeps the two renders identical.
  const entry = key && isBrowser ? cache.get(key) : undefined;
  return {
    data: entry?.data as T | undefined,
    error: entry?.error,
    loading: Boolean(key) && entry?.data === undefined && entry?.error === undefined,
    refresh,
  };
}
