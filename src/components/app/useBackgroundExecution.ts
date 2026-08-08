"use client";

import { useEffect, useState } from "react";

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
 */
export function useBackgroundExecution(): boolean | null {
  const [active, setActive] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health/mission", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        /**
         * Only a real boolean answers the question. `Boolean(...)` turned a
         * missing field into `false` and the string "false" into `true`,
         * which is worse than not knowing — unknown must stay unknown so
         * callers can say so.
         */
        if (cancelled) return;
        if (typeof d?.background_execution_active === "boolean") {
          setActive(d.background_execution_active);
        }
      })
      .catch(() => {
        /* unknown stays unknown — see above */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return active;
}
