import type { Metadata } from "next";
import Link from "next/link";
import { LogoLockup } from "@/components/brand/Logo";
import { PricingCards } from "@/components/pricing/PricingCards";
import { FaqAccordion } from "@/components/pricing/FaqAccordion";

export const metadata: Metadata = {
  title: "pricing — cosigno",
  description:
    "cosigno pricing: free, pro ($29/mo), and max ($99/mo). every plan is approval-first — the agent never spends without your signature.",
  alternates: { canonical: "https://cosignolabs.com/pricing" },
};

const FAQ = [
  {
    id: "what-counts-as-an-action",
    q: "what counts as an action?",
    a: "an action is one planning call or one execution. asking the operator to plan a command counts, and each card you approve that runs counts. vetoed and un-run proposals don't.",
  },
  {
    id: "hitting-the-limit",
    q: "what happens when i hit the limit?",
    a: "planning pauses with an upgrade prompt, and new commands are blocked until your cycle resets or you upgrade. proposals already on screen can still be approved, and nothing is ever charged as surprise overage.",
  },
  {
    id: "cancel-anytime",
    q: "can i cancel anytime?",
    a: "yes, from the billing portal. you keep your plan until the end of the period you've paid for, then drop to free — no lock-in.",
  },
  {
    id: "approval-first-billing",
    q: "how does approval-first keep billing safe?",
    a: "the operator can never spend money or take a paid action on its own — every send, change, or payment stops at a card for your signature, and tier-3 actions need typed confirmation. your plan only meters the operator's planning and the actions you approve.",
  },
  {
    id: "annual-refunds",
    q: "do you refund annual plans?",
    a: "annual refunds follow stripe's standard policy — manage cancellations and refunds from the billing portal, and reach out if anything looks off.",
  },
];

export default function PricingPage() {
  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5">
        <Link href="/" aria-label="cosigno home">
          <LogoLockup size={30} textClass="text-2xl" />
        </Link>
        <nav className="flex items-center gap-3">
          <Link
            href="/pricing"
            aria-current="page"
            className="rounded-btn px-4 py-2 text-sm font-bold lowercase text-ink"
          >
            pricing
          </Link>
          <Link
            href="/app"
            prefetch
            className="rounded-btn bg-ink px-4 py-2 text-sm font-bold lowercase text-cream transition-transform duration-fast hover:-translate-y-px"
          >
            open workspace
          </Link>
        </nav>
      </header>

      <main className="flex-1">
        <section className="mx-auto w-full max-w-5xl px-4 pb-16 pt-6 text-center">
          <h1 className="text-4xl font-extrabold lowercase tracking-tight sm:text-5xl">
            pricing that meters the operator, not you.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg font-semibold text-ink-soft">
            every plan is approval-first — the agent never spends without your
            signature. pick a ceiling, not a leash.
          </p>
          <div className="mt-10 text-left">
            <PricingCards />
          </div>
        </section>

        <section className="bg-cream-deep/60">
          <div className="mx-auto w-full max-w-3xl px-4 py-16">
            <h2 className="text-center text-2xl font-extrabold lowercase sm:text-3xl">
              questions, answered plainly
            </h2>
            <FaqAccordion items={FAQ} />
          </div>
        </section>
      </main>

      <footer className="bg-cream-deep/60">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-ink-soft">
          <LogoLockup size={20} textClass="text-base" />
          <div className="flex items-center gap-4 font-semibold">
            <Link href="/pricing" className="hover:text-ink">pricing</Link>
            <a href="https://cosignolabs.com" className="hover:text-ink">cosignolabs.com</a>
            <a href="https://instagram.com/aethric.hq" className="hover:text-ink">@aethric.hq</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
