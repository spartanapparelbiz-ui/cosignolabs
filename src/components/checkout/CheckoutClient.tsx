"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Lock } from "lucide-react";
import { getPlan, type Interval, type PlanId } from "@/lib/plans";
import { useCountUp } from "@/lib/useCountUp";
import { embeddedCheckoutEnabled } from "@/lib/stripeClient";
import { track } from "@/lib/analytics";
import { CheckoutCard, type CardState } from "./CheckoutCard";
import { LivingMark } from "@/components/brand/LivingLogo";

/**
 * Checkout orchestrator. Owns the shared UI — plan summary (with interval
 * count animation + proration line), the giant card, the trust row, the
 * success receipt + countdown — and lifts the card's safe visual state so
 * either driver can feed it:
 *   - ElementsForm: the real Stripe Elements path (loaded only when a
 *     publishable key is present), reporting field focus/complete/brand.
 *   - DemoForm: a keyless, no-charge preview that drives the exact same
 *     choreography from length-based progress (never real digits), so the
 *     experience is visible in dev + tests and degrades gracefully.
 * The webhook remains the sole writer of plan access; nothing here grants it.
 */

const ElementsForm = dynamic(() => import("./ElementsForm"), {
  loading: () => <div className="h-64 rounded-card bg-cream-deep" aria-hidden="true" />,
  ssr: false,
});

export interface CheckoutDriverProps {
  plan: PlanId;
  interval: Interval;
  name: string;
  setCard: (patch: Partial<CardState>) => void;
  onProcessing: () => void;
  onSuccess: (last4: string | null) => void;
  onError: (message: string) => void;
}

const REDIRECT_SECONDS = 4;

export function CheckoutClient({
  plan: planId,
  interval: initialInterval,
}: {
  plan: PlanId;
  interval: Interval;
}) {
  const plan = getPlan(planId);
  const [interval, setIntervalState] = useState<Interval>(initialInterval);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(REDIRECT_SECONDS);

  const [card, setCardState] = useState<CardState>({
    plan: planId === "max" ? "max" : "pro",
    name: "",
    focus: null,
    numberGroups: 0,
    brand: null,
    expiryComplete: false,
    phase: "idle",
    last4: null,
  });

  const setCard = useCallback((patch: Partial<CardState>) => {
    setCardState((c) => ({ ...c, ...patch }));
  }, []);

  // keep the card's name mirror in sync with our input
  useEffect(() => setCard({ name }), [name, setCard]);

  const amount = interval === "annual" ? plan.price.annual : plan.price.monthly;
  const shownAmount = useCountUp(amount, 420);

  const renewalDate = useMemo(() => {
    const d = new Date();
    if (interval === "annual") d.setFullYear(d.getFullYear() + 1);
    else d.setMonth(d.getMonth() + 1);
    return d.toLocaleDateString([], { year: "numeric", month: "long", day: "numeric" });
  }, [interval]);

  // success → countdown then redirect to the workspace
  useEffect(() => {
    if (card.phase !== "success") return;
    setCountdown(REDIRECT_SECONDS);
    const iv = setInterval(() => setCountdown((n) => Math.max(0, n - 1)), 1000);
    const to = setTimeout(() => {
      window.location.href = "/app";
    }, REDIRECT_SECONDS * 1000);
    return () => {
      clearInterval(iv);
      clearTimeout(to);
    };
  }, [card.phase]);

  const onProcessing = useCallback(() => {
    setError(null);
    setCard({ phase: "paying" });
  }, [setCard]);
  const onSuccess = useCallback(
    (last4: string | null) => {
      track("checkout_success", { plan: planId, interval });
      setCard({ phase: "success", last4, focus: null });
    },
    [setCard, planId, interval]
  );
  const onError = useCallback(
    (message: string) => {
      setError(message);
      setCard({ phase: "failure" });
      // settle back to idle so the customer can retry
      setTimeout(() => setCard({ phase: "idle" }), 900);
    },
    [setCard]
  );

  const driverProps: CheckoutDriverProps = {
    plan: planId,
    interval,
    name,
    setCard,
    onProcessing,
    onSuccess,
    onError,
  };

  const succeeded = card.phase === "success";

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-8 lg:grid-cols-[1fr_minmax(340px,420px)] lg:items-start lg:gap-12">
      {/* LEFT: summary + form (or success receipt) */}
      <div className="order-2 lg:order-1">
        {/* plan summary */}
        <div className="rounded-card bg-surface/70 p-5 shadow-soft">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-extrabold lowercase tracking-widest text-ink-soft">
                you&apos;re upgrading to
              </p>
              <p className="text-2xl font-extrabold lowercase">{plan.name}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-extrabold tabular-nums">
                ${shownAmount}
                <span className="text-sm font-bold text-ink-soft">
                  {interval === "annual" ? "/yr" : "/mo"}
                </span>
              </p>
            </div>
          </div>

          {/* interval toggle */}
          <div className="mt-4 flex w-fit items-center gap-1 rounded-pill bg-cream-deep p-1">
            {(["monthly", "annual"] as Interval[]).map((iv) => (
              <button
                key={iv}
                onClick={() => {
                  setIntervalState(iv);
                  track("checkout_interval", { interval: iv });
                }}
                aria-pressed={interval === iv}
                disabled={card.phase === "paying" || succeeded}
                className={`rounded-pill px-3.5 py-1.5 text-xs font-bold lowercase transition-all duration-base ease-brand-out disabled:opacity-50 ${
                  interval === iv ? "bg-ink text-cream shadow-soft" : "text-ink-soft"
                }`}
              >
                {iv === "annual" ? "annual · 2 months free" : "monthly"}
              </button>
            ))}
          </div>
          {interval === "annual" && (
            <p className="mt-2 animate-fade-through text-xs font-semibold text-signal">
              switched to annual — two months on us vs paying monthly.
            </p>
          )}
        </div>

        {/* form or success receipt */}
        {succeeded ? (
          <div className="mt-4 animate-rise-in rounded-card bg-surface/70 p-5 shadow-lift">
            <div className="mb-3 flex items-center gap-2.5">
              <LivingMark size={30} />
              <p className="text-lg font-extrabold lowercase">
                cosigned. welcome to {plan.name}.
              </p>
            </div>
            <dl className="mt-3 flex flex-col gap-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-soft">plan</dt>
                <dd className="font-bold lowercase">{plan.name} · {interval}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-soft">charged</dt>
                <dd className="font-bold tabular-nums">${amount}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-soft">renews</dt>
                <dd className="font-bold">{renewalDate}</dd>
              </div>
              {card.last4 && (
                <div className="flex justify-between">
                  <dt className="text-ink-soft">card</dt>
                  <dd className="font-mono font-bold">•••• {card.last4}</dd>
                </div>
              )}
            </dl>
            <div className="mt-4 flex items-center justify-between">
              <Link href="/app/account/plan" className="text-sm font-bold lowercase underline decoration-signal underline-offset-2">
                manage billing
              </Link>
              <span className="text-xs text-ink-soft">
                taking you to your workspace… {countdown}s
              </span>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <label htmlFor="cardholder" className="text-xs font-extrabold lowercase tracking-widest text-ink-soft">
              name on card
            </label>
            <input
              id="cardholder"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 40))}
              onFocus={() => setCard({ focus: "name" })}
              onBlur={() => setCard({ focus: null })}
              placeholder="alex operator"
              autoComplete="cc-name"
              className="mt-1.5 w-full rounded-btn bg-cream-deep px-3 py-2.5 text-sm font-semibold placeholder:text-ink-soft/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
            />

            <div className="mt-4">
              {embeddedCheckoutEnabled() ? (
                <ElementsForm {...driverProps} />
              ) : (
                <DemoForm {...driverProps} />
              )}
            </div>

            {error && (
              <p className="mt-3 rounded-btn bg-cream-deep px-3 py-2.5 text-sm font-semibold" role="alert">
                {error}
              </p>
            )}

            {/* trust row */}
            <p className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-ink-soft">
              <Lock size={13} strokeWidth={2.5} aria-hidden="true" />
              payments handled by Stripe — cosigno never sees your card number.
            </p>
            <p className="mt-1.5 text-xs text-ink-soft">
              14-day money-back guarantee — full refund from your account, one tap.
            </p>
          </div>
        )}
      </div>

      {/* RIGHT: the giant card */}
      <div className="order-1 lg:sticky lg:top-8 lg:order-2">
        <CheckoutCard state={card} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * DemoForm — keyless, no-charge preview. It reports the SAME safe
 * signals the real Elements form does (focus, group progress, detected
 * brand, expiry-complete) from input LENGTH only — it never renders the
 * typed digits on the card. "Pay" simulates the phases so the whole
 * choreography is demonstrable without Stripe.
 * ------------------------------------------------------------------ */
function detectBrand(first: string): CardState["brand"] {
  if (first.startsWith("4")) return "visa";
  if (/^5[1-5]/.test(first) || /^2[2-7]/.test(first)) return "mastercard";
  if (/^3[47]/.test(first)) return "amex";
  if (first.startsWith("6")) return "discover";
  return first.length > 0 ? "unknown" : null;
}

function DemoForm({ name, setCard, onProcessing, onSuccess, onError }: CheckoutDriverProps) {
  const [num, setNum] = useState("");
  const [exp, setExp] = useState("");
  const [cvc, setCvc] = useState("");

  function onNum(v: string) {
    const digits = v.replace(/\D/g, "").slice(0, 16);
    setNum(digits);
    const groups = Math.min(4, Math.floor(digits.length / 4)) as CardState["numberGroups"];
    setCard({ numberGroups: groups, brand: detectBrand(digits) });
  }
  function onExp(v: string) {
    const digits = v.replace(/\D/g, "").slice(0, 4);
    setExp(digits);
    setCard({ expiryComplete: digits.length === 4 });
  }

  const canPay = name.trim().length > 1 && num.length === 16 && exp.length === 4 && cvc.length >= 3;

  async function pay() {
    if (!canPay) return;
    onProcessing();
    track("checkout_demo_pay");
    // walk the phases; a "0000..." number simulates a decline
    await new Promise((r) => setTimeout(r, 1400));
    if (num.startsWith("0")) {
      onError("that card didn't go through — try another or check with your bank.");
    } else {
      onSuccess(num.slice(-4));
    }
  }

  const inputCls =
    "w-full rounded-btn bg-cream-deep px-3 py-2.5 text-sm font-semibold placeholder:text-ink-soft/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-signal";

  return (
    <div>
      <p className="mb-2 rounded-btn bg-cream-deep/70 px-3 py-1.5 text-[11px] font-bold lowercase text-ink-soft">
        preview mode · no real charge · digits never touch the card face
      </p>
      <label htmlFor="demo-num" className="sr-only">card number</label>
      <input
        id="demo-num"
        inputMode="numeric"
        value={num}
        onChange={(e) => onNum(e.target.value)}
        onFocus={() => setCard({ focus: "number" })}
        onBlur={() => setCard({ focus: null })}
        placeholder="card number"
        className={inputCls}
      />
      <div className="mt-2 flex gap-2">
        <input
          inputMode="numeric"
          aria-label="expiry MMYY"
          value={exp}
          onChange={(e) => onExp(e.target.value)}
          onFocus={() => setCard({ focus: "expiry" })}
          onBlur={() => setCard({ focus: null })}
          placeholder="MM YY"
          className={inputCls}
        />
        <input
          inputMode="numeric"
          aria-label="CVC"
          value={cvc}
          onChange={(e) => setCvc(e.target.value.replace(/\D/g, "").slice(0, 4))}
          onFocus={() => setCard({ focus: "cvc" })}
          onBlur={() => setCard({ focus: null })}
          placeholder="CVC"
          className={inputCls}
        />
      </div>
      <button
        onClick={pay}
        disabled={!canPay}
        className="group relative mt-4 w-full overflow-hidden rounded-btn bg-ink px-5 py-3 text-sm font-extrabold lowercase text-cream transition-transform active:scale-[0.99] disabled:opacity-50"
      >
        <span className="absolute inset-0 origin-left scale-x-0 bg-signal transition-transform duration-[320ms] ease-brand-out group-enabled:group-hover:scale-x-100" />
        <span className="relative transition-colors group-enabled:group-hover:text-ink">
          pay & cosign
        </span>
      </button>
    </div>
  );
}
