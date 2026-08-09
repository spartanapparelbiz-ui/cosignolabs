import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { Reveal } from "@/components/Reveal";

export const metadata: Metadata = {
  title: "cosigno — what cosigno can do",
  description:
    "The specialist capabilities cosigno routes your missions through — each with a defined job, real tools, and a hard authority ceiling.",
  alternates: { canonical: "https://cosignolabs.com/operators" },
};

/**
 * Public operators page. "Operators" are the REAL capability groups the
 * planner routes work through today — each maps to shipped action categories
 * with server-enforced authority levels. No fake agent personalities, no
 * capability that doesn't exist in the engine. The planner (chief operator)
 * coordinates them and can never raise anyone's authority.
 */

const OPERATORS = [
  {
    name: "research",
    job: "Finds, reads, compares, and organizes information.",
    caps: "search · summarize",
    authority: "observe — runs instantly, changes nothing",
    detail:
      "Read-only work never waits: it searches, reads, and hands back organized findings. Everything it reads from the outside world is treated as untrusted content and injection-scanned.",
  },
  {
    name: "communication",
    job: "Prepares replies, updates, and posts — and sends only with your signature.",
    caps: "draft · send_email · post_content",
    authority: "prepare runs instantly · sending waits for confirm",
    detail:
      "Drafting is safe by construction — nothing leaves the account, so drafts appear immediately. The moment anything would actually send or publish, it stops at an action card.",
  },
  {
    name: "records",
    job: "Updates the systems you point it at.",
    caps: "update_record · webhook",
    authority: "confirm — every change waits for sign-off",
    detail:
      "Each proposed change shows the exact payload before it happens, and the real result after — logged to your audit trail.",
  },
  {
    name: "finance",
    job: "Prepares spending, payments, and refunds — under the hardest lock.",
    caps: "spend · payment · refund",
    authority: "locked — typed confirmation, always",
    detail:
      "Money can never move on a click, and never automatically: these categories are pinned to the top tier and cannot be lowered, by you or the agent.",
  },
  {
    name: "cleanup",
    job: "Archives, labels, and — only with typed confirmation — deletes.",
    caps: "delete (destructive)",
    authority: "locked — typed confirmation, always",
    detail:
      "Destructive actions are pinned: no shortcut, rule, or connector can make them automatic.",
  },
  {
    name: "connections",
    job: "Acts through your connected tools — gmail today, plus any custom MCP server or API tool you add.",
    caps: "connection_call",
    authority: "tiered per capability — read 1 · write 2 · destructive 3",
    detail:
      "Every connected capability gets a server-assigned authority level from its risk. A connector can propose, but anything that changes something outside cosigno waits for your signature — and it can never talk its way into a weaker approval.",
  },
] as const;

export default function OperatorsPage() {
  return (
    <MarketingShell current="/operators">
      <section className="mx-auto w-full max-w-4xl px-4 pb-10 pt-10 text-center">
        <h1 className="font-display text-4xl font-bold lowercase tracking-tight sm:text-5xl">
          what cosigno can do
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg font-semibold text-ink-soft">
          when you give cosigno a mission, the planner routes the work through
          specialist capabilities — each with a defined job, real tools, and a
          hard authority ceiling the server enforces. no personas, no theater:
          this is exactly how the engine is built.
        </p>
      </section>

      <section className="mx-auto w-full max-w-5xl px-4 pb-6">
        <div className="grid gap-4 md:grid-cols-2">
          {OPERATORS.map((o, i) => (
            <Reveal
              key={o.name}
              delay={i * 60}
              className="flex flex-col rounded-card bg-surface p-5 shadow-soft ring-1 ring-inset ring-ink/10"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-lg font-bold lowercase">{o.name}</h2>
                <span className="ml-auto rounded-pill bg-cream-deep px-2.5 py-0.5 text-[10px] font-bold lowercase tracking-wide text-ink-soft">
                  {o.authority}
                </span>
              </div>
              <p className="mt-2 text-sm font-semibold leading-snug">{o.job}</p>
              <p className="mt-1.5 font-mono text-[11px] text-ink-soft">{o.caps}</p>
              <p className="mt-2 text-xs leading-relaxed text-ink-soft">{o.detail}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-3xl px-4 py-10 text-center">
        <Reveal>
          <h2 className="font-display text-2xl font-bold lowercase sm:text-3xl">
            and the chief operator? that&apos;s the planner.
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm font-semibold text-ink-soft">
            it reads your goal, chooses the simplest set of specialists that can
            deliver it, and lays out every step as inspectable action cards. it
            coordinates — it never approves. the one thing no operator can ever
            do is raise its own authority: the server assigns every action&apos;s
            level from its risk, and clamps anything that asks for less.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/sign-up"
              prefetch
              className="rounded-btn bg-signal px-7 py-3.5 text-base font-extrabold text-ink shadow-soft transition-transform duration-fast ease-brand-out hover:-translate-y-px active:scale-95"
            >
              give cosigno a mission
            </Link>
            <Link
              href="/demo"
              prefetch
              className="text-base font-bold lowercase text-ink underline decoration-signal decoration-2 underline-offset-4 hover:text-signal"
            >
              watch it work in the demo
            </Link>
          </div>
        </Reveal>
      </section>
    </MarketingShell>
  );
}
