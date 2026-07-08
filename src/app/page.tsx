import dynamic from "next/dynamic";
import Link from "next/link";
import { LivingLockup, LivingMark } from "@/components/brand/LivingLogo";
import { BetaForm } from "@/components/landing/BetaForm";
import { HeroMark } from "@/components/landing/HeroMark";
import { StaggerHeadline } from "@/components/landing/StaggerHeadline";
import { BenefitGlyph } from "@/components/landing/BenefitGlyphs";
import { CheckDivider } from "@/components/landing/CheckDivider";
import { Island } from "@/components/landing/Island";
import { Reveal } from "@/components/Reveal";

// The sandbox is below the fold — lazy-loaded so it never touches LCP.
const LivePreview = dynamic(() => import("@/components/landing/LivePreview"), {
  loading: () => (
    <div className="mx-auto h-64 w-full max-w-2xl rounded-card bg-cream-deep" aria-hidden="true" />
  ),
});

// Interactive islands — each dynamically imported so they never touch LCP.
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

const HandoffCalculator = dynamic(
  () => import("@/components/landing/HandoffCalculator"),
  {
    loading: () => (
      <div className="mx-auto h-72 w-full max-w-2xl rounded-card bg-cream-deep" aria-hidden="true" />
    ),
  }
);

const BENEFITS = [
  {
    kind: "card" as const,
    title: "real execution, not chat",
    body: "cosigno doesn't hand you advice and wish you luck. it plans across your tools and does the work — archives, drafts, updates, sends — as concrete actions with exact payloads.",
  },
  {
    kind: "check" as const,
    title: "every action, your call",
    body: "anything that sends, posts, changes, or spends stops at an action card and waits for your signature. destructive moves need typed confirmation on top. the agent can never escalate its own permissions.",
  },
  {
    kind: "ledger" as const,
    title: "total audit trail",
    body: 'every proposal, approval, veto, and execution is permanently logged with its payload — filterable, exportable, and yours. you can always answer "what did it do, and who said yes?"',
  },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5">
        <LivingLockup size={30} textClass="text-2xl" />
        <nav className="flex items-center gap-3">
          <Link
            href="/pricing"
            prefetch
            className="hidden rounded-btn px-4 py-2 text-sm font-bold lowercase text-ink-soft transition-colors duration-fast hover:bg-cream-deep sm:block"
          >
            pricing
          </Link>
          <Link
            href="/app"
            prefetch
            className="rounded-btn px-4 py-2 text-sm font-bold lowercase ring-1 ring-inset ring-ink transition-all duration-fast ease-brand-out hover:-translate-y-px hover:bg-cream-deep"
          >
            open workspace
          </Link>
        </nav>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative mx-auto grid w-full max-w-6xl items-center gap-10 px-4 pb-16 pt-8 lg:grid-cols-2 lg:pt-16">
          {/* Subtle radial glow behind the mark — depth, not noise. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-0 top-0 -z-10 h-[520px] w-[520px] translate-x-1/4 rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(255,75,31,0.06) 0%, rgba(255,75,31,0) 70%)",
            }}
          />
          <div>
            <StaggerHeadline
              text="the AI operator that asks first."
              className="text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl"
            />
            <p className="mt-5 max-w-xl text-lg font-semibold text-ink-soft animate-word-in [animation-delay:520ms]">
              cosigno plans, drafts, and executes across your tools — and
              nothing moves without your signature.
            </p>
            <div className="mt-8 flex flex-wrap gap-3 animate-word-in [animation-delay:640ms]">
              <Link
                href="/app"
                prefetch
                className="rounded-btn bg-signal px-7 py-3.5 text-base font-extrabold text-ink shadow-soft transition-transform duration-fast ease-brand-out hover:-translate-y-px hover:scale-[1.02] active:scale-95"
              >
                start free
              </Link>
              <a
                href="#try"
                className="rounded-btn px-7 py-3.5 text-base font-bold lowercase ring-1 ring-inset ring-ink transition-all duration-fast hover:-translate-y-px hover:bg-cream-deep"
              >
                try it first
              </a>
            </div>
            <p className="mt-4 text-sm text-ink-soft animate-word-in [animation-delay:760ms]">
              free forever to start. <Link href="/pricing" className="underline decoration-signal underline-offset-2 hover:text-ink">see pricing</Link> — pro is $29/mo.
            </p>
          </div>
          <div className="flex justify-center lg:justify-end">
            <HeroMark />
          </div>
        </section>

        {/* Interactive approval story */}
        <section className="bg-cream-deep/50">
          <Reveal className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-4 py-16">
            <h2 className="text-center text-2xl font-extrabold lowercase sm:text-3xl">
              one command. one signature. done.
            </h2>
            <p className="-mt-3 max-w-md text-center text-sm font-semibold text-ink-soft">
              you be the operator. approve two actions — then catch the one an
              injected email tried to slip past you.
            </p>
            <Island minHeight={300} className="w-full max-w-lg">
              <ApprovalStory />
            </Island>
          </Reveal>
        </section>

        {/* Live preview sandbox */}
        <section id="try" className="mx-auto w-full max-w-6xl px-4 py-16">
          <Reveal className="text-center">
            <h2 className="text-2xl font-extrabold lowercase sm:text-3xl">
              try it — no account needed
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm font-semibold text-ink-soft">
              the real approval loop against simulated tools. pick a command or
              type your own — nothing leaves your browser session.
            </p>
          </Reveal>
          <div className="mt-8">
            <LivePreview />
          </div>
        </section>

        {/* Benefits */}
        <section className="bg-cream-deep/60">
          <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-16 md:grid-cols-3">
            {BENEFITS.map((b, i) => (
              <Reveal key={b.title} delay={i * 90}>
                <BenefitGlyph kind={b.kind} />
                <h2 className="mt-4 text-lg font-extrabold lowercase">{b.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{b.body}</p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Playable permissions board */}
        <section className="mx-auto w-full max-w-6xl px-4 py-16">
          <Reveal className="flex flex-col items-center">
            <h2 className="text-center text-2xl font-extrabold lowercase sm:text-3xl">
              you set the rope. try it.
            </h2>
            <p className="mt-3 max-w-xl text-center text-sm font-semibold text-ink-soft">
              every kind of action sits in a tier — auto, approve, or locked.
              move one and see what changes. this is the real model.
            </p>
            <div className="mt-8 flex w-full justify-center">
              <Island minHeight={240} className="w-full max-w-3xl">
                <TierBoard />
              </Island>
            </div>
          </Reveal>
        </section>

        <CheckDivider />

        {/* How the loop works */}
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
              ["receipt", "approved actions execute server-side and land in your permanent audit trail."],
            ].map(([title, body], i) => (
              <Reveal key={title} delay={i * 80} className="rounded-card bg-white/70 p-4 shadow-soft">
                <span className="text-xs font-extrabold text-signal">0{i + 1}</span>
                <h3 className="mt-1 font-extrabold lowercase">{title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">{body}</p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* What would you hand off? calculator */}
        <section className="bg-cream-deep/60">
          <Reveal className="mx-auto flex w-full max-w-2xl flex-col items-center px-4 py-16">
            <h2 className="text-center text-2xl font-extrabold lowercase sm:text-3xl">
              what would you hand off?
            </h2>
            <p className="mt-3 max-w-xl text-center text-sm font-semibold text-ink-soft">
              pick what eats your week. we&apos;ll size it — and show which plan
              fits and how much time you get back.
            </p>
            <div className="mt-8 w-full">
              <Island minHeight={320}>
                <HandoffCalculator />
              </Island>
            </div>
          </Reveal>
        </section>

        {/* Beta application */}
        <section id="beta">
          <Reveal className="mx-auto w-full max-w-2xl px-4 py-16">
            <div className="flex flex-col items-center text-center">
              <LivingMark size={44} />
              <h2 className="mt-4 text-2xl font-extrabold lowercase sm:text-3xl">
                hand your busywork to an operator that asks first.
              </h2>
              <p className="mt-3 text-sm font-semibold text-ink-soft">
                this is an application, not a waitlist. tell us what you&apos;d
                delegate — we&apos;re building the first integrations around
                the founding cohort&apos;s workflows.
              </p>
            </div>
            <div className="mt-8">
              <BetaForm />
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="bg-cream-deep/60">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-ink-soft">
          <LivingLockup size={20} textClass="text-base" />
          <div className="flex items-center gap-4 font-semibold">
            <Link href="/pricing" className="hover:text-ink">
              pricing
            </Link>
            <a href="https://cosignolabs.com" className="hover:text-ink">
              cosignolabs.com
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
