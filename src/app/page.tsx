import dynamic from "next/dynamic";
import Link from "next/link";
import { LivingLockup, LivingMark, LogoHome } from "@/components/brand/LivingLogo";
import { BetaForm } from "@/components/landing/BetaForm";
import { HeroMissionDemo } from "@/components/landing/HeroMissionDemo";
import { OutcomeStrip } from "@/components/landing/OutcomeStrip";
import { LaunchJobs } from "@/components/landing/LaunchJobs";
import { Comparison } from "@/components/landing/Comparison";
import { ProofBand } from "@/components/landing/ProofBand";
import { StaggerHeadline } from "@/components/landing/StaggerHeadline";
import { BenefitGlyph } from "@/components/landing/BenefitGlyphs";
import { CheckDivider } from "@/components/landing/CheckDivider";
import { Island } from "@/components/landing/Island";
import { ApplyViewTracker, PricingLink } from "@/components/landing/Track";
import { Reveal } from "@/components/Reveal";
import { PLANS, PLAN_ORDER } from "@/lib/plans";

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

/** Rough, labeled translation of an action allowance into job runs (~5/run). */
function runsEstimate(actions: number): string {
  return `≈ ${Math.floor(actions / 5).toLocaleString()} job runs`;
}

const TEMPLATE_TITLES = [
  "clean up my inbox",
  "prepare my follow-ups",
  "build my morning brief",
  "build tomorrow's meeting brief",
  "compare three laptops under $1,000",
];

// Section order follows the conversion spec: hero → outcomes → interactive
// story + sandbox → the three launch jobs → comparison → proof → signature
// system → templates → security → pricing preview → founder close.

export default function LandingPage() {
  return (
    <div className="flex min-h-screen [min-height:100dvh] flex-col overflow-x-hidden">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5">
        <LogoHome size={30} textClass="text-2xl" />
        <nav className="flex items-center gap-1 sm:gap-2">
          {[
            ["/product", "product"],
            ["/templates", "templates"],
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
            start free
          </Link>
        </nav>
      </header>

      <main className="flex-1">
        {/* 1 · Hero — the working mission demo beside the promise */}
        <section className="relative mx-auto grid min-h-[62dvh] w-full max-w-6xl content-center items-center gap-10 px-4 pb-16 pt-8 lg:min-h-[calc(100dvh-160px)] lg:grid-cols-2 lg:pt-8">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-signal">
              the AI operator that asks first
            </p>
            <StaggerHeadline
              text="give cosigno the work. keep the final say."
              className="mt-3 font-display text-4xl font-bold leading-[1.06] tracking-tight sm:text-5xl lg:text-[3.3rem]"
            />
            <p className="mt-5 max-w-xl text-lg font-semibold text-ink-soft animate-word-in [animation-delay:520ms]">
              cosigno handles inbox, follow-ups, calendar work, and updates
              across your apps — then stops for your signature before anything
              important happens.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4 animate-word-in [animation-delay:600ms]">
              <Link
                href="/demo"
                prefetch
                className="rounded-btn bg-signal px-7 py-3.5 text-base font-extrabold text-ink shadow-soft transition-transform duration-fast ease-brand-out hover:-translate-y-px hover:scale-[1.02] active:scale-95"
              >
                try a real mission
              </Link>
              <a
                href="#try"
                className="text-base font-bold lowercase text-ink underline decoration-signal decoration-2 underline-offset-4 transition-colors hover:text-signal"
              >
                or try it right here ↓
              </a>
            </div>
            <p className="mt-4 text-xs font-semibold text-ink-soft animate-word-in [animation-delay:700ms]">
              no credit card · no installation required · simulated tools in the
              demo · nothing sends without approval
            </p>
          </div>
          <div className="flex justify-center lg:justify-end">
            <HeroMissionDemo />
          </div>
        </section>

        {/* 2 · Outcome strip — the three results, each backed by a shipped job */}
        <OutcomeStrip />

        {/* 3 · The interactive approval story + open sandbox — the "aha" */}
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

        {/* 4 · The three launch jobs — exact before/after, sandbox-labeled */}
        <LaunchJobs />

        {/* 5 · Why not another chatbot? */}
        <Comparison />

        {/* 6 · Proof band — receipt · video · builder. real assets only */}
        <section className="mx-auto w-full max-w-6xl px-4 py-16">
          <Reveal className="text-center">
            <h2 className="font-display text-2xl font-bold lowercase sm:text-3xl">
              proof, not promises
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm font-semibold text-ink-soft">
              we don&apos;t fake receipts. here&apos;s the real thing as it
              lands, and the human building it.
            </p>
          </Reveal>
          <div className="mt-10">
            <ProofBand />
          </div>
        </section>

        <CheckDivider />

        {/* 7 · How the signature system works — the loop + the tiers */}
        <section className="mx-auto w-full max-w-6xl px-4 py-16">
          <Reveal className="flex flex-col items-center">
            <BenefitGlyph kind="check" />
            <h2 className="mt-4 text-center text-2xl font-extrabold lowercase sm:text-3xl">
              how the signature system works
            </h2>
            <p className="mt-3 max-w-2xl text-center text-base leading-relaxed text-ink-soft">
              anything that sends, posts, changes, or spends stops at an action
              card and waits for your signature. destructive moves need typed
              confirmation on top. every action sits in a tier — auto, approve,
              or locked — and the agent can never escalate its own permissions.
            </p>
          </Reveal>
          <div className="mx-auto mt-10 grid max-w-4xl gap-6 sm:grid-cols-4">
            {[
              ["command", "tell it what you want in plain language."],
              ["proposal", "it plans and lays out action cards — exact payloads, plain english, risk tier."],
              ["signature", "you approve, edit, or veto. locked actions need typed confirmation."],
              ["receipt", "approved actions execute, get verified, and land in your permanent audit trail."],
            ].map(([title, body], i) => (
              <Reveal key={title} delay={i * 80} className="rounded-card bg-surface/70 p-4 shadow-soft">
                <span className="text-xs font-extrabold text-signal">0{i + 1}</span>
                <h3 className="mt-1 font-extrabold lowercase">{title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">{body}</p>
              </Reveal>
            ))}
          </div>
          <Reveal className="mt-12 flex flex-col items-center">
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

        {/* 8 · Templates — the installable jobs, one link away */}
        <section className="bg-cream-deep/50">
          <div className="mx-auto w-full max-w-5xl px-4 py-14 text-center">
            <Reveal>
              <h2 className="font-display text-2xl font-bold lowercase sm:text-3xl">
                start from a template
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-sm font-semibold text-ink-soft">
                every template is a job that actually runs end to end — with its
                auto/signature split spelled out before you start it.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {TEMPLATE_TITLES.map((t) => (
                  <span
                    key={t}
                    className="rounded-pill bg-surface px-3.5 py-1.5 text-sm font-bold lowercase shadow-soft ring-1 ring-inset ring-line/70"
                  >
                    {t}
                  </span>
                ))}
              </div>
              <Link
                href="/templates"
                prefetch
                className="mt-6 inline-block text-sm font-bold lowercase underline decoration-signal decoration-2 underline-offset-4 transition-colors hover:text-signal"
              >
                browse the templates →
              </Link>
            </Reveal>
          </div>
        </section>

        {/* 9 · Security + the audit trail */}
        <section className="mx-auto grid w-full max-w-5xl items-center gap-8 px-4 py-16 md:grid-cols-[auto_1fr]">
          <Reveal>
            <BenefitGlyph kind="ledger" />
          </Reveal>
          <Reveal delay={80}>
            <h2 className="font-display text-2xl font-bold lowercase sm:text-3xl">
              security, permissions, and a total audit trail
            </h2>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-soft">
              connections request the least access that works, your keys never reach the browser, and
              every proposal, approval, veto, and execution is permanently
              logged with its exact payload — filterable, exportable, and
              yours. you can always answer the only question that matters:
              <span className="font-bold text-ink"> what did it do, and who said yes?</span>
            </p>
            <Link
              href="/security"
              prefetch
              className="mt-4 inline-block text-sm font-bold lowercase underline decoration-signal decoration-2 underline-offset-4 transition-colors hover:text-signal"
            >
              read the security guarantees →
            </Link>
          </Reveal>
        </section>

        {/* 10 · Pricing preview — straight from the enforced plans SSOT */}
        <section className="bg-cream-deep/50">
          <div className="mx-auto w-full max-w-5xl px-4 py-14">
            <Reveal className="text-center">
              <h2 className="font-display text-2xl font-bold lowercase sm:text-3xl">
                simple pricing
              </h2>
            </Reveal>
            <div className="mx-auto mt-8 grid max-w-3xl gap-4 sm:grid-cols-3">
              {PLAN_ORDER.map((id, i) => {
                const p = PLANS[id];
                return (
                  <Reveal
                    key={id}
                    delay={i * 70}
                    className={`rounded-card bg-surface p-5 text-center shadow-soft ${
                      id === "pro" ? "ring-2 ring-signal" : "ring-1 ring-inset ring-line/70"
                    }`}
                  >
                    <h3 className="text-sm font-extrabold lowercase">{p.name}</h3>
                    <p className="mt-1 font-display text-2xl font-bold">
                      {p.price.monthly === 0 ? "$0" : `$${p.price.monthly}`}
                      {p.price.monthly > 0 && <span className="text-sm font-semibold text-ink-soft">/mo</span>}
                    </p>
                    <p className="mt-1.5 text-xs font-semibold text-ink-soft">
                      {p.actionLimit.toLocaleString()} actions / month
                    </p>
                    <p className="text-[11px] font-semibold text-ink-soft">
                      {runsEstimate(p.actionLimit)} (estimate)
                    </p>
                  </Reveal>
                );
              })}
            </div>
            <Reveal className="mt-6 text-center">
              <PricingLink className="text-sm font-bold lowercase underline decoration-signal decoration-2 underline-offset-4 transition-colors hover:text-signal">
                see full pricing →
              </PricingLink>
            </Reveal>
          </div>
        </section>

        {/* 11 · Founder close — the one thing to do */}
        <section id="beta">
          <ApplyViewTracker />
          <Reveal className="mx-auto w-full max-w-2xl px-4 py-16">
            <div className="flex flex-col items-center text-center">
              <LivingMark size={44} />
              <h2 className="mt-4 text-2xl font-extrabold lowercase sm:text-3xl">
                hand your busywork to an operator that asks first.
              </h2>
              <p className="mt-4 max-w-xl text-sm font-semibold leading-relaxed text-ink-soft">
                cosigno is built independently, in the open, on one conviction:
                an AI that acts in your accounts should show you exactly what it
                will do and wait for your signature — every time, enforced by
                the server, never by promises. that&apos;s the whole product.
              </p>
              <div className="mt-6">
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
            {/* the single, de-emphasised pricing mention on the page */}
            <p className="mt-5 text-center text-xs font-semibold text-ink-soft">
              the founding cohort locks pro at $29/mo.{" "}
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
