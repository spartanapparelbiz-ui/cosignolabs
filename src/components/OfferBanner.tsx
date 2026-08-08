"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { track } from "@/lib/analytics";
import { INTRO_FIRST_MONTH_PRICE, PLANS } from "@/lib/plans";

interface Offers {
  usageOffer: boolean;
  annualNudge: { monthActions: number; savings: number } | null;
}

/**
 * One-time, server-gated in-app offers. /api/offers claims each offer
 * atomically the first time it returns true, so it surfaces exactly once per
 * customer. Purely presentational here — all eligibility is server-side.
 */
export function OfferBanner() {
  const [offers, setOffers] = useState<Offers | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/offers")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && setOffers(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (dismissed || !offers) return null;

  let body: React.ReactNode = null;
  let href = "";
  let event = "";

  if (offers.usageOffer) {
    href = "/checkout?plan=pro&interval=monthly";
    event = "offer_usage";
    body = (
      <>
        you&apos;ve used all {PLANS.free.actionLimit} free actions this month — keep going with{" "}
        <span className="font-semibold">{PLANS.pro.name} for ${INTRO_FIRST_MONTH_PRICE} your first month</span>.
      </>
    );
  } else if (offers.annualNudge) {
    href = "/checkout?plan=pro&interval=annual";
    event = "offer_annual";
    body = (
      <>
        you ran <span className="font-semibold">{offers.annualNudge.monthActions} actions</span> last
        month — switching to annual saves{" "}
        <span className="font-semibold">${offers.annualNudge.savings}/yr</span>.
      </>
    );
  } else {
    return null;
  }

  return (
    <div className="animate-rise-in mx-auto mb-4 flex w-full max-w-none items-center gap-3 rounded-card bg-ink px-4 py-3 text-cream shadow-raise">
      <p className="min-w-0 flex-1 text-sm font-semibold">{body}</p>
      <Link
        href={href}
        prefetch
        onClick={() => track(event)}
        className="shrink-0 rounded-btn bg-signal px-4 py-2 text-sm font-semibold text-ink transition-transform duration-fast hover:-translate-y-px active:scale-95"
      >
        see the offer
      </Link>
      <button
        onClick={() => setDismissed(true)}
        aria-label="dismiss offer"
        className="shrink-0 rounded-btn p-1.5 text-cream/70 transition-colors hover:bg-surface/10 hover:text-cream"
      >
        <X size={16} strokeWidth={2.5} aria-hidden="true" />
      </button>
    </div>
  );
}
