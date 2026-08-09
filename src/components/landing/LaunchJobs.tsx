import Link from "next/link";
import { Inbox, Reply, Sunrise } from "lucide-react";
import { Reveal } from "@/components/Reveal";

/**
 * The three launch jobs, each with an exact before/after. The examples are
 * the REAL fixtures the built-in sandbox runs (3 newsletters, 2 waiting
 * threads, a morning brief) — labeled as such, never dressed up as customer
 * results. Every card links to surfaces that exist.
 */

const JOBS = [
  {
    icon: Inbox,
    title: "clean up my inbox",
    before: "3 newsletters burying 2 threads that actually need you.",
    after:
      "What matters summarized, 2 replies drafted (drafts can't send), and the clutter archived — only after your signature, with a read-back check.",
  },
  {
    icon: Reply,
    title: "prepare my follow-ups",
    before: "“re: proposal — any update?” has sat unread for 3 days.",
    after:
      "A context-aware follow-up drafted, a send time proposed from your calendar's free/busy, sent only when you sign — then verified in Sent Mail.",
  },
  {
    icon: Sunrise,
    title: "build my morning brief",
    before: "It's 8:55 and you don't know what today actually holds.",
    after:
      "One brief: today's events, overnight inbox signals, suggested priorities — and a time-block offered as its own approval card.",
  },
] as const;

export function LaunchJobs() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-16">
      <Reveal className="text-center">
        <h2 className="font-display text-2xl font-bold lowercase sm:text-3xl">
          three real jobs, working today
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm font-semibold text-ink-soft">
          not a roadmap — these run end to end right now, on your Gmail and
          Calendar once connected, or in the clearly-labeled sandbox before
          that. the examples below are the sandbox&apos;s own fixtures.
        </p>
      </Reveal>
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {JOBS.map((job, i) => (
          <Reveal
            key={job.title}
            delay={i * 80}
            className="flex flex-col rounded-card border border-line/70 bg-surface p-5 shadow-soft"
          >
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-btn bg-cream-deep">
                <job.icon size={17} className="text-ink-soft" aria-hidden="true" />
              </span>
              <h3 className="text-base font-extrabold lowercase">{job.title}</h3>
            </div>
            <div className="mt-4 flex flex-1 flex-col gap-3 text-xs">
              <div className="rounded-btn bg-cream-deep/60 p-3">
                <p className="font-extrabold lowercase text-ink-soft">before</p>
                <p className="mt-0.5 font-semibold leading-relaxed">{job.before}</p>
              </div>
              <div className="rounded-btn bg-signal/[0.07] p-3 ring-1 ring-inset ring-signal/25">
                <p className="font-extrabold lowercase text-signal">after</p>
                <p className="mt-0.5 font-semibold leading-relaxed">{job.after}</p>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-4 text-sm font-bold lowercase">
              <Link
                href="/demo"
                prefetch
                className="underline decoration-signal decoration-2 underline-offset-4 transition-colors hover:text-signal"
              >
                try it in the demo
              </Link>
              <Link
                href="/templates"
                className="text-ink-soft underline underline-offset-4 transition-colors hover:text-ink"
              >
                see the template
              </Link>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
