"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadStripe, type Stripe, type StripeElementStyle } from "@stripe/stripe-js";
import {
  CardCvcElement,
  CardExpiryElement,
  CardNumberElement,
  Elements,
  PaymentRequestButtonElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { CREAM, CREAM_DEEP, INK, INK_SOFT, SIGNAL } from "@/lib/brand";
import { getPlan } from "@/lib/plans";
import { publishableKey } from "@/lib/stripeClient";
import type { CheckoutDriverProps } from "./CheckoutClient";
import type { CardState } from "./CheckoutCard";

/**
 * The real Stripe Elements checkout. Card number/expiry/CVC are entered ONLY
 * inside Stripe's iframes — this component reads focus, completion, and the
 * detected brand (no digits ever), and last4 only from the confirmed
 * PaymentMethod. If Stripe.js or the subscription can't load, it degrades to
 * hosted Checkout.
 */

let stripePromise: Promise<Stripe | null> | null = null;
function getStripePromise(): Promise<Stripe | null> {
  const key = publishableKey();
  if (!key) return Promise.resolve(null);
  if (!stripePromise) stripePromise = loadStripe(key);
  return stripePromise;
}

const fieldStyle: StripeElementStyle = {
  base: {
    color: INK,
    fontFamily: "inherit",
    fontSize: "15px",
    fontWeight: "600",
    "::placeholder": { color: "rgba(92,86,80,0.5)" },
    iconColor: INK_SOFT,
  },
  invalid: { color: INK, iconColor: SIGNAL },
};

export default function ElementsForm(props: CheckoutDriverProps) {
  const { plan, interval, onError } = props;
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [fatal, setFatal] = useState(false);
  const [stripeReady, setStripeReady] = useState<Stripe | null>(null);

  // Load Stripe.js once; if it can't load, fall back to hosted checkout.
  useEffect(() => {
    let alive = true;
    getStripePromise()
      .then((s) => {
        if (!alive) return;
        if (!s) setFatal(true);
        else setStripeReady(s);
      })
      .catch(() => alive && setFatal(true));
    return () => {
      alive = false;
    };
  }, []);

  // Create (or recreate, on interval switch) the incomplete subscription and
  // grab its PaymentIntent client secret.
  useEffect(() => {
    let alive = true;
    setClientSecret(null);
    fetch("/api/billing/subscription", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan, interval }),
    })
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw new Error(b.message || "couldn't start checkout.");
        if (alive) setClientSecret(b.clientSecret);
      })
      .catch(() => alive && setFatal(true));
    return () => {
      alive = false;
    };
  }, [plan, interval]);

  const appearance = useMemo(
    () =>
      ({
        theme: "flat" as const,
        variables: {
          colorPrimary: SIGNAL,
          colorBackground: CREAM_DEEP,
          colorText: INK,
          colorTextSecondary: INK_SOFT,
          borderRadius: "10px",
          fontFamily: "inherit",
          spacingUnit: "4px",
        },
      }),
    []
  );

  if (fatal) return <HostedFallback plan={plan} interval={interval} onError={onError} />;
  if (!clientSecret || !stripeReady) {
    return <div className="h-56 animate-pulse rounded-card bg-cream-deep" aria-hidden="true" />;
  }

  return (
    <Elements stripe={stripeReady} options={{ clientSecret, appearance }}>
      <InnerForm {...props} clientSecret={clientSecret} />
    </Elements>
  );
}

function InnerForm({
  plan,
  interval,
  name,
  setCard,
  onProcessing,
  onSuccess,
  onError,
  clientSecret,
}: CheckoutDriverProps & { clientSecret: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState<Record<string, string>>({});
  const [walletReady, setWalletReady] = useState(false);
  const prRef = useRef<ReturnType<NonNullable<typeof stripe>["paymentRequest"]> | null>(null);

  const amountCents = useMemo(() => {
    const p = getPlan(plan);
    return (interval === "annual" ? p.price.annual : p.price.monthly) * 100;
  }, [plan, interval]);

  // Apple/Google Pay via the Payment Request button.
  useEffect(() => {
    if (!stripe) return;
    const pr = stripe.paymentRequest({
      country: "US",
      currency: "usd",
      total: { label: `cosigno ${plan}`, amount: amountCents },
      requestPayerName: true,
      requestPayerEmail: false,
    });
    pr.canMakePayment().then((res) => setWalletReady(Boolean(res)));
    pr.on("paymentmethod", async (ev) => {
      onProcessing();
      const { error, paymentIntent } = await stripe.confirmCardPayment(
        clientSecret,
        { payment_method: ev.paymentMethod.id },
        { handleActions: false }
      );
      if (error) {
        ev.complete("fail");
        onError("that didn't go through — try another card or check with your bank.");
        return;
      }
      ev.complete("success");
      if (paymentIntent?.status === "requires_action") {
        const { error: err2 } = await stripe.confirmCardPayment(clientSecret);
        if (err2) return onError("we couldn't finish verifying that card — try again.");
      }
      onSuccess(ev.paymentMethod.card?.last4 ?? null);
    });
    prRef.current = pr;
  }, [stripe, amountCents, plan, clientSecret, onProcessing, onSuccess, onError]);

  function report(field: string, e: { complete: boolean; empty: boolean; brand?: string; error?: { message: string } }) {
    setFieldError((prev) => ({ ...prev, [field]: e.error?.message ?? "" }));
    if (field === "number") {
      const groups: CardState["numberGroups"] = e.complete ? 4 : e.empty ? 0 : 2;
      setCard({
        numberGroups: groups,
        brand: (e.brand as CardState["brand"]) ?? (e.empty ? null : "unknown"),
      });
    }
    if (field === "expiry") setCard({ expiryComplete: e.complete });
  }

  async function pay() {
    if (!stripe || !elements || busy) return;
    const numberEl = elements.getElement(CardNumberElement);
    if (!numberEl) return;
    setBusy(true);
    onProcessing();
    // Create the PaymentMethod first so we can surface last4 on success — the
    // ONLY card detail we ever display, and only after Stripe returns it.
    const { error: pmError, paymentMethod } = await stripe.createPaymentMethod({
      type: "card",
      card: numberEl,
      billing_details: { name },
    });
    if (pmError || !paymentMethod) {
      setBusy(false);
      onError(pmError?.message || "that card didn't go through — try another or check with your bank.");
      return;
    }
    const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: paymentMethod.id,
    });
    setBusy(false);
    if (error) {
      onError("that card didn't go through — try another or check with your bank.");
      return;
    }
    if (paymentIntent && (paymentIntent.status === "succeeded" || paymentIntent.status === "processing")) {
      onSuccess(paymentMethod.card?.last4 ?? null);
    } else {
      onError("that payment needs another step — try again.");
    }
  }

  const wrap = "rounded-btn bg-cream-deep px-3 py-3 focus-within:ring-2 focus-within:ring-signal";

  return (
    <div>
      {walletReady && prRef.current && (
        <div className="mb-4">
          <PaymentRequestButtonElement
            options={{ paymentRequest: prRef.current, style: { paymentRequestButton: { theme: "dark", height: "46px" } } }}
          />
          <div className="my-3 flex items-center gap-3 text-[11px] font-bold lowercase text-ink-soft">
            <span className="h-px flex-1 bg-line" /> or pay by card <span className="h-px flex-1 bg-line" />
          </div>
        </div>
      )}

      <div className={wrap}>
        <CardNumberElement
          options={{ style: fieldStyle, showIcon: true }}
          onFocus={() => setCard({ focus: "number" })}
          onBlur={() => setCard({ focus: null })}
          onChange={(e) => report("number", e)}
        />
      </div>
      {fieldError.number && <FieldError msg={fieldError.number} />}

      <div className="mt-2 flex gap-2">
        <div className={`${wrap} flex-1`}>
          <CardExpiryElement
            options={{ style: fieldStyle }}
            onFocus={() => setCard({ focus: "expiry" })}
            onBlur={() => setCard({ focus: null })}
            onChange={(e) => report("expiry", e)}
          />
        </div>
        <div className={`${wrap} flex-1`}>
          <CardCvcElement
            options={{ style: fieldStyle }}
            onFocus={() => setCard({ focus: "cvc" })}
            onBlur={() => setCard({ focus: null })}
            onChange={(e) => report("cvc", e)}
          />
        </div>
      </div>
      {(fieldError.expiry || fieldError.cvc) && <FieldError msg={fieldError.expiry || fieldError.cvc} />}

      <button
        onClick={pay}
        disabled={busy || !stripe}
        className="group relative mt-4 w-full overflow-hidden rounded-btn bg-ink px-5 py-3 text-sm font-extrabold lowercase text-cream transition-transform active:scale-[0.99] disabled:opacity-50"
      >
        <span className="absolute inset-0 origin-left scale-x-0 bg-signal transition-transform duration-[320ms] ease-brand-out group-enabled:group-hover:scale-x-100" />
        <span className="relative transition-colors group-enabled:group-hover:text-ink">
          {busy ? "processing…" : "pay & cosign"}
        </span>
      </button>
    </div>
  );
}

function FieldError({ msg }: { msg: string }) {
  return <p className="mt-1.5 text-xs font-semibold text-ink-soft" role="alert">{msg.toLowerCase()}</p>;
}

/** Graceful degradation: hand off to Stripe-hosted Checkout. */
function HostedFallback({
  plan,
  interval,
  onError,
}: {
  plan: string;
  interval: string;
  onError: (m: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, interval }),
      });
      const b = await res.json();
      if (!res.ok) throw new Error(b.message || "couldn't open checkout.");
      window.location.href = b.url;
    } catch (e) {
      setBusy(false);
      onError(e instanceof Error ? e.message : "couldn't open checkout.");
    }
  }
  return (
    <div className="rounded-card bg-cream-deep p-4">
      <p className="text-sm font-semibold">
        the inline card form couldn&apos;t load here — you can still check out securely.
      </p>
      <button
        onClick={go}
        disabled={busy}
        className="mt-3 w-full rounded-btn bg-ink px-5 py-3 text-sm font-extrabold lowercase text-cream disabled:opacity-50"
      >
        {busy ? "opening…" : "continue to secure checkout"}
      </button>
    </div>
  );
}
