import Link from "next/link";
import { LogoLockup, CosignoMark } from "@/components/brand/Logo";
import { DemoLoop } from "@/components/landing/DemoLoop";
import { BetaForm } from "@/components/landing/BetaForm";

const BENEFITS = [
  {
    title: "Real execution, not chat",
    body: "cosigno doesn't hand you advice and wish you luck. It plans across your tools and does the work — archives, drafts, updates, sends — as concrete actions with exact payloads.",
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" fill="#141414" />
      </svg>
    ),
  },
  {
    title: "Every action, your call",
    body: "Anything that sends, posts, changes, or spends stops at an action card and waits for your signature. Destructive moves need typed confirmation on top. The agent can never escalate its own permissions.",
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="10" fill="#141414" />
        <path
          d="M7.5 12.5 10.8 16 17 8.5"
          stroke="#FF4B1F"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    title: "Total audit trail",
    body: "Every proposal, approval, veto, and execution is permanently logged with its payload — filterable, exportable, and yours. You can always answer \"what did it do, and who said yes?\"",
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="4" y="3" width="16" height="18" rx="2.5" fill="#141414" />
        <path d="M8 8h8M8 12h8M8 16h5" stroke="#FBF4EA" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5">
        <LogoLockup size={30} textClass="text-2xl" />
        <nav className="flex items-center gap-3">
          <Link
            href="/app"
            className="rounded-pill border border-ink px-4 py-2 text-sm font-bold transition-colors hover:bg-cream-deep"
          >
            Open workspace
          </Link>
          <a
            href="#beta"
            className="hidden rounded-pill bg-ink px-4 py-2 text-sm font-bold text-cream sm:block"
          >
            Founding beta
          </a>
        </nav>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 pb-16 pt-8 lg:grid-cols-2 lg:pt-16">
          <div>
            <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              <span className="lowercase">cosigno</span> — the AI operator that
              asks first.
            </h1>
            <p className="mt-5 max-w-xl text-lg font-semibold text-ink-soft">
              Cosigno plans, drafts, and executes across your tools — and
              nothing moves without your signature.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#beta"
                className="rounded-pill bg-ink px-7 py-3.5 text-base font-extrabold text-cream transition-transform hover:scale-[1.02] active:scale-95"
              >
                Apply for the founding beta
              </a>
              <Link
                href="/app"
                className="rounded-pill border border-ink px-7 py-3.5 text-base font-bold transition-colors hover:bg-cream-deep"
              >
                Try the workspace
              </Link>
            </div>
            <p className="mt-4 text-sm text-ink-soft">
              Limited seats. We&apos;re onboarding a small founding cohort —
              applications reviewed weekly.
            </p>
          </div>
          <div className="flex justify-center lg:justify-end">
            <DemoLoop />
          </div>
        </section>

        {/* Benefits */}
        <section className="border-y border-line bg-cream-deep/50">
          <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-16 md:grid-cols-3">
            {BENEFITS.map((b) => (
              <div key={b.title}>
                {b.icon}
                <h2 className="mt-4 text-lg font-extrabold">{b.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{b.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How the loop works */}
        <section className="mx-auto w-full max-w-6xl px-4 py-16">
          <h2 className="text-center text-2xl font-extrabold sm:text-3xl">
            One loop. No surprises.
          </h2>
          <div className="mx-auto mt-10 grid max-w-4xl gap-6 sm:grid-cols-4">
            {[
              ["command", "Tell it what you want in plain language."],
              ["proposal", "It plans and lays out action cards — exact payloads, plain English, risk tier."],
              ["signature", "You approve, edit, or veto. Locked actions need typed confirmation."],
              ["receipt", "Approved actions execute server-side and land in your permanent audit trail."],
            ].map(([title, body], i) => (
              <div key={title} className="relative rounded-card border border-line bg-white/60 p-4">
                <span className="text-xs font-extrabold text-accent">0{i + 1}</span>
                <h3 className="mt-1 font-extrabold lowercase">{title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Beta application */}
        <section id="beta" className="border-t border-line bg-cream-deep/50">
          <div className="mx-auto w-full max-w-2xl px-4 py-16">
            <div className="text-center">
              <CosignoMark size={40} />
              <h2 className="mt-4 text-2xl font-extrabold sm:text-3xl">
                Hand your busywork to an operator that asks first.
              </h2>
              <p className="mt-3 text-sm font-semibold text-ink-soft">
                This is an application, not a waitlist. Tell us what you&apos;d
                delegate — we&apos;re building the first integrations around the
                founding cohort&apos;s workflows.
              </p>
            </div>
            <div className="mt-8">
              <BetaForm />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-ink-soft">
          <LogoLockup size={20} textClass="text-base" />
          <div className="flex items-center gap-4 font-semibold">
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
