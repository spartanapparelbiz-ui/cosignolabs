import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { Reveal } from "@/components/Reveal";

export const metadata: Metadata = {
  title: "cosigno — product",
  description:
    "The approval-first AI operator: it plans, prepares, and executes across your tools — with your authority exactly where you want it.",
  alternates: { canonical: "https://cosignolabs.com/product" },
};

/**
 * Public product overview. Everything on this page describes the SHIPPED
 * product — the operating loop, the authority model, action cards, and the
 * audit trail — never capabilities that don't exist yet.
 */

const LOOP = [
  ["command", "tell it the goal in plain language."],
  ["plan", "it breaks the goal into concrete actions — exact payloads, plain english."],
  ["prepare", "reads and drafts run instantly; nothing external moves yet."],
  ["preview", "every consequential action becomes a card you can inspect."],
  ["approve", "you sign, edit, or veto. locked actions need typed confirmation."],
  ["execute", "approved actions run away from your browser — never before, never without you."],
  ["verify", "the real result lands on the card, not a vague success."],
  ["receipt", "everything is written to your permanent, exportable audit trail."],
] as const;

const AUTHORITY = [
  {
    name: "observe",
    tier: "runs instantly",
    body: "Read-only work — searching, reading, summarizing. Nothing leaves your accounts, so it doesn't wait.",
  },
  {
    name: "prepare",
    tier: "runs instantly",
    body: "Drafts and proposals — a reply saved as a draft, a plan laid out. Created, never sent.",
  },
  {
    name: "confirm",
    tier: "waits for your signature",
    body: "Anything that sends, posts, changes, or spends stops at an action card until you approve it.",
  },
  {
    name: "locked",
    tier: "typed confirmation",
    body: "Destructive or irreversible moves — deletes, refunds — require you to type the confirmation. No shortcut can approve them.",
  },
] as const;

export default function ProductPage() {
  return (
    <MarketingShell current="/product">
      <section className="mx-auto w-full max-w-4xl px-4 pb-12 pt-10 text-center">
        <h1 className="font-display text-4xl font-bold lowercase tracking-tight sm:text-5xl">
          delegate the work. keep the last word.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg font-semibold text-ink-soft">
          cosigno is an operating layer between you and your software: you give
          it a goal, it plans and prepares the work, and nothing consequential
          moves without the level of permission you chose.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/sign-up"
            prefetch
            className="rounded-btn bg-signal px-7 py-3.5 text-base font-extrabold text-ink shadow-soft transition-transform duration-fast ease-brand-out hover:-translate-y-px active:scale-95"
          >
            start with cosigno
          </Link>
          <Link
            href="/#try"
            className="text-base font-bold lowercase text-ink underline decoration-signal decoration-2 underline-offset-4 hover:text-signal"
          >
            watch a mission ↓
          </Link>
        </div>
      </section>

      {/* the operating loop */}
      <section className="bg-cream-deep/50">
        <div className="mx-auto w-full max-w-6xl px-4 py-14">
          <Reveal>
            <h2 className="text-center font-display text-2xl font-bold lowercase sm:text-3xl">
              one loop, eight beats, no surprises
            </h2>
          </Reveal>
          <div className="mx-auto mt-9 grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {LOOP.map(([title, body], i) => (
              <Reveal key={title} delay={i * 60} className="rounded-card bg-surface/70 p-4 shadow-soft">
                <span className="font-mono text-xs font-extrabold text-signal">
                  0{i + 1}
                </span>
                <h3 className="mt-1 font-extrabold lowercase">{title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">{body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* the authority system */}
      <section className="mx-auto w-full max-w-6xl px-4 py-14">
        <Reveal className="text-center">
          <h2 className="font-display text-2xl font-bold lowercase sm:text-3xl">
            the authority system
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm font-semibold text-ink-soft">
            every kind of action sits at an authority level. the server assigns
            the level from the action&apos;s risk — the agent can never raise its
            own authority, and you can always make an action more restricted.
          </p>
        </Reveal>
        <div className="mx-auto mt-9 grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {AUTHORITY.map((a, i) => (
            <Reveal key={a.name} delay={i * 70} className="flex flex-col rounded-card bg-surface p-5 shadow-soft ring-1 ring-inset ring-ink/10">
              <h3 className="font-display text-lg font-bold lowercase">{a.name}</h3>
              <span className="mt-1 inline-block self-start rounded-pill bg-cream-deep px-2.5 py-0.5 text-[10px] font-bold lowercase tracking-wide text-ink-soft">
                {a.tier}
              </span>
              <p className="mt-3 text-sm leading-relaxed text-ink-soft">{a.body}</p>
            </Reveal>
          ))}
        </div>
        <Reveal className="mx-auto mt-6 max-w-2xl text-center text-sm font-semibold text-ink-soft">
          scoped trust is yours to grant: the permissions board lets you move a
          category of work into the instant tier — and one click moves it back.
          destructive actions are pinned; they can never be made automatic.
        </Reveal>
      </section>

      {/* action cards */}
      <section className="bg-cream-deep/50">
        <div className="mx-auto grid w-full max-w-5xl items-center gap-8 px-4 py-14 md:grid-cols-2">
          <Reveal>
            <h2 className="font-display text-2xl font-bold lowercase sm:text-3xl">
              action cards, not vague continue buttons
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">
              every consequential action is a structured card: what it will do in
              one plain sentence, the exact payload in mono, the authority level,
              why it was proposed, and — after you sign — the real result. if
              external content (like an email) tried to direct the agent, the
              card is flagged and can never auto-run.
            </p>
          </Reveal>
          <Reveal delay={90}>
            {/* a faithful, static rendering of the real card anatomy */}
            <div className="rounded-card bg-surface p-5 shadow-lift ring-1 ring-inset ring-ink/10">
              <div className="flex items-center gap-2">
                <span className="rounded-pill bg-ink/5 px-2.5 py-0.5 text-[10px] font-bold lowercase tracking-wide ring-1 ring-inset ring-ink/20">
                  gmail · confirm
                </span>
                <span className="ml-auto rounded-pill bg-cream-deep px-2.5 py-0.5 text-[10px] font-bold lowercase text-ink-soft">
                  awaiting sign-off
                </span>
              </div>
              <p className="mt-3 text-sm font-semibold leading-snug">
                send the follow-up to the acme thread — recap plus the two open questions.
              </p>
              <p className="mt-1.5 font-mono text-[11px] text-ink-soft">
                gmail.send · to: dana@acme.example · 1 attachment
              </p>
              <div className="mt-3 flex gap-2">
                <span className="rounded-btn bg-signal px-4 py-2 text-xs font-extrabold text-ink">approve</span>
                <span className="rounded-btn px-4 py-2 text-xs font-bold lowercase ring-1 ring-inset ring-ink">edit</span>
                <span className="rounded-btn px-4 py-2 text-xs font-bold lowercase ring-1 ring-inset ring-ink">veto</span>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* audit */}
      <section className="mx-auto w-full max-w-4xl px-4 py-14 text-center">
        <Reveal>
          <h2 className="font-display text-2xl font-bold lowercase sm:text-3xl">
            what did it do, and who said yes?
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm font-semibold text-ink-soft">
            every proposal, approval, veto, and execution is permanently logged
            with its exact payload — filterable, exportable, and yours. that
            question always has an answer.
          </p>
          <div className="mt-7">
            <Link
              href="/sign-up"
              prefetch
              className="rounded-btn bg-signal px-7 py-3.5 text-base font-extrabold text-ink shadow-soft transition-transform duration-fast ease-brand-out hover:-translate-y-px active:scale-95"
            >
              start with cosigno
            </Link>
          </div>
        </Reveal>
      </section>
    </MarketingShell>
  );
}
