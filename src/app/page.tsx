import dynamic from "next/dynamic";
import Link from "next/link";
import { LivingLockup, LivingMark, LogoHome } from "@/components/brand/LivingLogo";
import { BetaForm } from "@/components/landing/BetaForm";
import { HeroSignatureCard } from "@/components/landing/HeroSignatureCard";
import { ProofBand } from "@/components/landing/ProofBand";
import { BenefitGlyph } from "@/components/landing/BenefitGlyphs";
import { CheckDivider } from "@/components/landing/CheckDivider";
import { Island } from "@/components/landing/Island";
import { ApplyViewTracker, PricingLink } from "@/components/landing/Track";
import { Reveal } from "@/components/Reveal";
import { PLANS, introOfferLabel, priceLabel } from "@/lib/plans";

// The sandbox is below the fold — lazy-loaded so it never touches LCP.
const LivePreview = dynamic(() => import("@/components/landing/LivePreview"), {
  loading: () => (
    <div className="mx-auto h-64 w-full max-w-2xl rounded-card bg-cream-deep" aria-hidden="true" />
  ),
});

const ApprovalStory = dynamic(() => import("@/components/landing/ApprovalStory"), {
  loading: () => (
    <div className="mx-auto h-72 w-full max-w-lg rounded-card bg-cream-deep" aria-hidden="true" />
  ),
});

const TierBoard = dynamic(() => import("@/components/landing/TierBoard"), {
  loading: () => (
    <div className="mx-auto h-56 w-full max-w-3xl rounded-card bg-cream-deep" aria-hidden="true" />
  ),
});

// Primary conversion: self-serve signup ("start with cosigno"). The founding
// cohort application remains as a secondary, discovery-rich path at the close.

export default function LandingPage() {
  return (
    <div className="flex min-h-screen [min-height:100dvh] flex-col overflow-x-hidden">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5">
        <LogoHome size={30} textClass="text-2xl" />
        <nav className="flex items-center gap-1 sm:gap-2">
          {[
            ["/product", "product"],
            ["/operators", "capabilities"],
            ["/templates", "use cases"],
            ["/security", "security"],
          ].map(([href, label]) => (
            <Link
              key={href}
              href={href}
              prefetch
              className="hidden rounded-btn px-3 py-2 text-sm font-bold lowercase text-ink-soft transition-colors duration-fast hover:bg-cream-deep md:block"
            >
              {label}
            </Link>
          ))}
          <PricingLink className="hidden rounded-btn px-3 py-2 text-sm font-bold lowercase text-ink-soft transition-colors duration-fast hover:bg-cream-deep sm:block">
            pricing
          </PricingLink>
          <Link
            href="/sign-in"
            prefetch
            className="hidden rounded-btn px-3 py-2 text-sm font-bold lowercase text-ink-soft transition-colors duration-fast hover:bg-cream-deep sm:block"
          >
            sign in
          </Link>
          <Link
            href="/sign-up"
            prefetch
            className="rounded-btn bg-signal px-4 py-2 text-sm font-extrabold text-ink shadow-soft transition-all duration-fast ease-brand-out hover:-translate-y-px active:scale-95"
          >
            try cosigno
          </Link>
        </nav>
      </header>

      <main className="flex-1">
        {/* 1 · Hero — outcome first. The result, not the mechanism. */}
        <section className="relative mx-auto grid min-h-[62dvh] w-full max-w-6xl content-center items-center gap-10 px-4 pb-16 pt-8 lg:min-h-[calc(100dvh-160px)] lg:grid-cols-2 lg:pt-8">
          <div>
            {/* The full promise is visible immediately — no word-by-word entrance.
                A single, fast whole-block fade (< 700ms) that never gates reading. */}
            <h1 className="font-display text-4xl font-bold leading-[1.06] tracking-tight animate-word-in sm:text-5xl lg:text-[3.3rem]">
              give cosigno a task.
              <br />
              approve what matters.
              <br />
              it handles the rest.
            </h1>
            <p className="mt-5 max-w-xl text-lg font-semibold text-ink-soft animate-word-in [animation-delay:120ms]">
              clear your inbox, prepare meetings, follow up, research decisions,
              and update your tools from one command. nothing sends, changes, or
              spends until you approve it.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4 animate-word-in [animation-delay:220ms]">
              <Link
                href="/demo"
                prefetch
                className="rounded-btn bg-signal px-7 py-3.5 text-base font-extrabold text-ink shadow-soft transition-transform duration-fast ease-brand-out hover:-translate-y-px hover:scale-[1.02] active:scale-95"
              >
                try a task now
              </Link>
              <a
                href="#try"
                className="text-base font-bold lowercase text-ink underline decoration-signal decoration-2 underline-offset-4 transition-colors hover:text-signal"
              >
                watch cosigno work ↓
              </a>
            </div>
          </div>
          <div className="flex justify-center lg:justify-end">
            <HeroSignatureCard />
          </div>
        </section>

        {/* 2 · The demo — promoted directly under the hero. The differentiator.
            The guided injected-email catch is the centerpiece "aha"; the open
            sandbox lives just below it. */}
        <section id="try" className="bg-cream-deep/50">
          <div className="mx-auto w-full max-w-6xl px-4 py-16">
            <Reveal className="text-center">
              <h2 className="font-display text-2xl font-bold lowercase sm:text-3xl">
                try it — no account needed
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-sm font-semibold text-ink-soft">
                this is the real approval model, running locally in your tab.
                nothing leaves your browser session; the tools are simulated —
                the decisions are yours.
              </p>
            </Reveal>

            <Reveal className="mt-10 flex flex-col items-center gap-4">
              <p className="max-w-md text-center text-sm font-bold lowercase text-ink">
                one command. one signature. done.
              </p>
              <p className="-mt-2 max-w-md text-center text-sm font-semibold text-ink-soft">
                you&apos;re the operator. approve two actions — then catch the
                one an injected email tried to slip past you.
              </p>
              <Island minHeight={300} className="w-full max-w-lg">
                <ApprovalStory />
              </Island>
            </Reveal>
          </div>
        </section>

        {/* the open sandbox — drive it yourself */}
        <section id="sandbox" className="mx-auto w-full max-w-6xl px-4 py-16">
          <Reveal className="text-center">
            <p className="text-sm font-bold lowercase text-ink-soft">
              or drive it yourself — type any command
            </p>
            <p className="mt-1 text-xs font-semibold text-ink-soft">
              want the full screen?{" "}
              <Link href="/demo" prefetch className="font-bold underline decoration-signal underline-offset-2 hover:text-signal">
                open the demo dashboard
              </Link>
            </p>
          </Reveal>
          <div className="mt-6">
            <LivePreview />
          </div>
        </section>

        {/* 3 · Who's building this — real founder info (no placeholder "proof") */}
        <section className="mx-auto w-full max-w-6xl px-4 py-16">
          <Reveal className="text-center">
            <h2 className="font-display text-2xl font-bold lowercase sm:text-3xl">
              built in the open
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm font-semibold text-ink-soft">
              no fabricated receipts, logos, or testimonials. the real proof is
              the demo above — and the person building it.
            </p>
          </Reveal>
          <div className="mt-10">
            <ProofBand />
          </div>
        </section>

        {/* 4 · Real execution, not chat — the engine, confirmed after the demo */}
        <section className="bg-cream-deep/60">
          <div className="mx-auto grid w-full max-w-5xl items-center gap-8 px-4 py-16 md:grid-cols-[auto_1fr]">
            <Reveal>
              <BenefitGlyph kind="card" />
            </Reveal>
            <Reveal delay={80}>
              <h2 className="font-display text-2xl font-bold lowercase sm:text-3xl">
                real execution, not chat
              </h2>
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-soft">
                cosigno doesn&apos;t hand you advice and wish you luck. it plans
                across your tools and does the work — archives, drafts, updates,
                sends — as concrete actions with exact payloads, in plain
                english, each tagged with its risk tier.
              </p>
            </Reveal>
          </div>
        </section>

        {/* 5 · The trust mechanism — the brakes, positioned as the unlock */}
        <section className="mx-auto w-full max-w-6xl px-4 py-16">
          <Reveal className="flex flex-col items-center">
            <BenefitGlyph kind="check" />
            <h2 className="mt-4 text-center text-2xl font-extrabold lowercase sm:text-3xl">
              every action is your call
            </h2>
            <p className="mt-3 max-w-2xl text-center text-base leading-relaxed text-ink-soft">
              anything that sends, posts, changes, or spends stops at an action
              card and waits for your signature. destructive moves need typed
              confirmation on top. every action sits in a tier — auto, approve,
              or locked — and the agent can never escalate its own permissions.
              that&apos;s exactly why you can hand it real work.
            </p>
          </Reveal>
          <Reveal className="mt-10 flex flex-col items-center">
            <p className="max-w-xl text-center text-sm font-bold lowercase text-ink">
              you set the rope. move one and see what changes.
            </p>
            <div className="mt-6 flex w-full justify-center">
              <Island minHeight={240} className="w-full max-w-3xl">
                <TierBoard />
              </Island>
            </div>
          </Reveal>
        </section>

        {/* 6 · Total audit trail — the enterprise wedge in one line */}
        <section className="bg-cream-deep/60">
          <div className="mx-auto grid w-full max-w-5xl items-center gap-8 px-4 py-16 md:grid-cols-[auto_1fr]">
            <Reveal>
              <BenefitGlyph kind="ledger" />
            </Reveal>
            <Reveal delay={80}>
              <h2 className="font-display text-2xl font-bold lowercase sm:text-3xl">
                total audit trail
              </h2>
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-soft">
                every proposal, approval, veto, and execution is permanently
                logged with its exact payload — filterable, exportable, and
                yours. you can always answer the only question that matters:
                <span className="font-bold text-ink"> what did it do, and who said yes?</span>
              </p>
            </Reveal>
          </div>
        </section>

        <CheckDivider />

        {/* 7 · The loop — four beats */}
        <section className="mx-auto w-full max-w-6xl px-4 py-16">
          <Reveal>
            <h2 className="text-center text-2xl font-extrabold lowercase sm:text-3xl">
              one loop. no surprises.
            </h2>
          </Reveal>
          <div className="mx-auto mt-10 grid max-w-4xl gap-6 sm:grid-cols-4">
            {[
              ["command", "tell it what you want in plain language."],
              ["proposal", "it plans and lays out action cards — exact payloads, plain english, risk tier."],
              ["signature", "you approve, edit, or veto. locked actions need typed confirmation."],
              ["receipt", "approved actions execute and land in your permanent audit trail."],
            ].map(([title, body], i) => (
              <Reveal key={title} delay={i * 80} className="rounded-card bg-surface/70 p-4 shadow-soft">
                <span className="text-xs font-extrabold text-signal">0{i + 1}</span>
                <h3 className="mt-1 font-extrabold lowercase">{title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">{body}</p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* 8 · Application close — the one thing to do */}
        <section id="beta" className="bg-cream-deep/60">
          <ApplyViewTracker />
          <Reveal className="mx-auto w-full max-w-2xl px-4 py-16">
            <div className="flex flex-col items-center text-center">
              <LivingMark size={44} />
              <h2 className="mt-4 text-2xl font-extrabold lowercase sm:text-3xl">
                hand your busywork to an operator that asks first.
              </h2>
              <div className="mt-5">
                <Link
                  href="/sign-up"
                  prefetch
                  className="rounded-btn bg-signal px-7 py-3.5 text-base font-extrabold text-ink shadow-soft transition-transform duration-fast ease-brand-out hover:-translate-y-px active:scale-95"
                >
                  start with cosigno
                </Link>
              </div>
              <p className="mt-6 text-sm font-semibold text-ink-soft">
                or join the founding cohort: tell us what you&apos;d delegate and
                we&apos;ll build the first integrations around your workflow —
                applications reviewed weekly.
              </p>
            </div>
            <div className="mt-6">
              <BetaForm />
            </div>
            {/* the single, de-emphasised pricing mention on the page — one offer, everywhere */}
            <p className="mt-5 text-center text-xs font-semibold text-ink-soft">
              pro is {priceLabel(PLANS.pro, "monthly")} — {introOfferLabel()}.{" "}
              <PricingLink className="underline decoration-signal underline-offset-2 hover:text-ink">
                see what&apos;s included
              </PricingLink>
              .
            </p>
          </Reveal>
        </section>
      </main>

      <footer className="bg-cream-deep/60">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-ink-soft">
          <LivingLockup size={20} textClass="text-base" />
          <div className="flex items-center gap-4 font-semibold">
            <PricingLink className="hover:text-ink">pricing</PricingLink>
            <Link href="/privacy" className="hover:text-ink">
              privacy
            </Link>
            <Link href="/terms" className="hover:text-ink">
              terms
            </Link>
            <a href="mailto:hello@aethric.llc" className="hover:text-ink">
              hello@aethric.llc
            </a>
            <a href="https://instagram.com/aethric.hq" className="hover:text-ink">
              @aethric.hq
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
