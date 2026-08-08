"use client";

import { useResource } from "@/lib/client/resource";
import { BACKGROUND_HEALTH_KEY } from "@/lib/client/keys";

/**
 * Is anything actually going to run scheduled work while nobody is here?
 *
 * Every surface that offers a standing order, a watch, or a recurring rule is
 * making the same promise: this happens without you. On a deployment with no
 * scheduler configured that promise is simply false — the tick routes are
 * never called and a recurring order never fires once. The failure is silent,
 * which is what makes it dangerous: nothing errors, the order just sits there
 * looking healthy forever.
 *
 * One hook so every one of those surfaces tells the same story, and a new one
 * cannot forget to ask.
 *
 * Returns `null` while unknown — callers must say nothing rather than guess in
 * either direction.
 *
 * The answer is a property of the DEPLOYMENT, not of the user's data: it
 * cannot change while somebody is looking at a page. So it is read through the
 * shared cache with a long freshness window — asked once per session, and
 * every surface that needs it shares that one answer.
 */
const DEPLOYMENT_FACT_MS = 10 * 60_000;

export function useBackgroundExecution(): boolean | null {
  const { data } = useResource<{ background_execution_active?: unknown }>(
    BACKGROUND_HEALTH_KEY,
    { staleMs: DEPLOYMENT_FACT_MS }
  );
  /**
   * Only a real boolean answers the question. `Boolean(...)` turned a missing
   * field into `false` and the string "false" into `true`, which is worse than
   * not knowing — unknown must stay unknown so callers can say so.
   */
  return typeof data?.background_execution_active === "boolean"
    ? data.background_execution_active
    : null;
}
