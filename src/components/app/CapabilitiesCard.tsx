"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ChevronDown, PenLine } from "lucide-react";
import type { CapabilityReport } from "@/lib/capabilities";

/**
 * "What can cosigno do right now?" — an honest, collapsible read of what the
 * user's REAL connected apps + permissions allow. It never lists an
 * integration that isn't connected, and it's explicit about what needs the
 * user's authority. Collapsed by default so NOW stays calm.
 */

const CARD = "rounded-card border border-line/70 bg-surface p-5 shadow-soft";
const SECTION_TITLE = "text-xs font-extrabold uppercase tracking-widest text-ink-soft";

export function CapabilitiesCard() {
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState<CapabilityReport | null>(null);

  const load = useCallback(() => {
    fetch("/api/capabilities", { headers: { "Content-Type": "application/json" } })
      .then((r) => r.json())
      .then((d) => setReport(d.capabilities ?? null))
      .catch(() => setReport(null));
  }, []);

  useEffect(() => {
    if (open && !report) load();
  }, [open, report, load]);

  return (
    <section>
      <h2 className={SECTION_TITLE}>What cosigno can do</h2>
      <div className={`${CARD} mt-3`}>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <span className="text-sm font-semibold text-ink-soft">
            What can you do right now?
          </span>
          <ChevronDown size={16} className={`shrink-0 text-ink-soft transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <div className="mt-3">
            {report === null ? (
              <div className="h-24 animate-pulse rounded-btn bg-cream-deep" aria-hidden="true" />
            ) : (
              <>
                <p className="text-[11px] font-extrabold uppercase tracking-wide text-ink-soft">Right now I can</p>
                <ul className="mt-1.5 flex flex-col gap-1">
                  {report.can_now.map((c) => (
                    <li key={c} className="flex items-start gap-2 text-sm font-semibold">
                      <Check size={13} strokeWidth={3} className="mt-0.5 shrink-0 text-ink" />
                      {c}
                    </li>
                  ))}
                </ul>
                {report.needs_you.length > 0 && (
                  <>
                    <p className="mt-3 text-[11px] font-extrabold uppercase tracking-wide text-ink-soft">
                      I&apos;ll need you to authorize
                    </p>
                    <ul className="mt-1.5 flex flex-col gap-1">
                      {report.needs_you.slice(0, 6).map((n) => (
                        <li key={n} className="flex items-start gap-2 text-sm text-ink-soft">
                          <PenLine size={12} className="mt-0.5 shrink-0" />
                          {n}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {report.note && (
                  <p className="mt-3 rounded-btn bg-cream-deep px-3 py-2 text-xs font-semibold text-ink-soft">
                    {report.note}
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
