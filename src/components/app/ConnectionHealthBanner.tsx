"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

/**
 * A slim banner shown ONLY while a connected app has lost its authority —
 * an expired sign-in, revoked access, a failing token. Missions that need
 * the app degrade quietly, so the person has to hear about it where they
 * already are, not on a settings page they'd only visit once they suspected
 * something. Invisible while every connection is healthy, and absent on the
 * connections page itself, where the same truth is already on screen with
 * the fix one click closer.
 */

interface BrokenConn {
  display_name: string;
  status: string;
}

async function fetchBroken(): Promise<BrokenConn[]> {
  try {
    const res = await fetch("/api/connections", {
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) return [];
    const list: BrokenConn[] = (await res.json()).connections ?? [];
    // Only states the person can repair. A deliberate disconnect is a
    // choice, not a problem to nag about.
    return list.filter((c) => c.status === "needs_reauth" || c.status === "error");
  } catch {
    return [];
  }
}

export function ConnectionHealthBanner() {
  const [broken, setBroken] = useState<BrokenConn[]>([]);
  const pathname = usePathname();

  const refresh = useCallback(() => {
    fetchBroken().then(setBroken);
  }, []);

  useEffect(() => {
    refresh();
    // Connection health moves slowly — a slow poll plus a refresh whenever
    // the tab returns keeps this honest without background chatter.
    const t = setInterval(() => {
      if (document.visibilityState !== "hidden") refresh();
    }, 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  if (broken.length === 0 || pathname?.startsWith("/app/connections")) return null;

  const names = broken.map((b) => b.display_name).join(", ");
  const one = broken.length === 1;
  return (
    <div className="bg-signal/12 text-ink">
      <div className="mx-auto flex w-full max-w-none flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-center text-[12px] font-bold">
        <AlertTriangle size={14} className="shrink-0 text-signal" aria-hidden="true" />
        <span>
          {names} {one ? "has" : "have"} lost {one ? "its" : "their"} connection —
          cosigno can&apos;t use {one ? "it" : "them"} until you reconnect.
        </span>
        <Link
          href="/app/connections"
          className="rounded-pill bg-ink px-3 py-0.5 text-[11px] font-extrabold text-cream transition-transform active:scale-95"
        >
          Reconnect
        </Link>
      </div>
    </div>
  );
}
