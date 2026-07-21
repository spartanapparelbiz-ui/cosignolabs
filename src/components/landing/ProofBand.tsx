import Link from "next/link";
import { ShieldAlert } from "lucide-react";

/**
 * Proof band — REAL assets only, per the proof rules: never "coming soon"
 * inside a proof section, never a dressed-up placeholder. What's real today:
 *
 *   1. the live injected-email catch — the visitor can run it themselves,
 *      right now, in the sandbox above (that IS the proof);
 *   2. the builder line — one human sentence + @aethric.hq.
 *
 * When a redacted production receipt or a real recording exists, it takes
 * the open slot — until then the section stays honest and smaller.
 */
export function ProofBand() {
  return (
    <div className="mx-auto grid w-full max-w-4xl gap-5 md:grid-cols-2">
      {/* 1 · runnable proof — the injection catch, live in this page */}
      <figure className="flex flex-col justify-between rounded-card bg-surface p-5 shadow-soft ring-1 ring-inset ring-ink/10">
        <div>
          <div className="flex items-center gap-2 text-ink-soft">
            <ShieldAlert size={16} strokeWidth={2.4} aria-hidden="true" />
            <span className="text-[11px] font-bold lowercase tracking-wide">
              proof you can run yourself
            </span>
          </div>
          <p className="mt-3 text-[15px] font-semibold leading-relaxed">
            don&apos;t take a screenshot&apos;s word for it. in the sandbox
            above, type{" "}
            <code className="rounded bg-cream-deep px-1.5 py-0.5 font-mono text-[12px]">
              check my mail
            </code>{" "}
            — a planted hostile email tries to hijack the agent, and you watch
            cosigno flag and hold it. every card, every tier, every audit row
            is the same code path the real product runs.
          </p>
        </div>
        <Link
          href="#try"
          className="mt-4 inline-block text-[13px] font-extrabold lowercase text-signal underline-offset-2 hover:underline"
        >
          run the injected-email catch ↑
        </Link>
      </figure>

      {/* 2 · builder line (real today) */}
      <figure className="flex flex-col justify-between rounded-card bg-ink p-5 text-cream shadow-soft">
        <div>
          <span className="text-[11px] font-bold lowercase tracking-wide text-cream/60">
            who made this
          </span>
          <p className="mt-3 text-[15px] font-semibold leading-relaxed">
            i&apos;m a solo builder at aethric. i wanted an agent i could trust
            with real work — one that asks before it sends, and logs everything
            it does. so i&apos;m building it in the open, cohort by cohort.
          </p>
        </div>
        <a
          href="https://instagram.com/aethric.hq"
          className="mt-4 inline-block text-[13px] font-extrabold lowercase text-signal underline-offset-2 hover:underline"
        >
          @aethric.hq
        </a>
      </figure>
    </div>
  );
}
