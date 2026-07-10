import { FileCheck2, PlayCircle } from "lucide-react";

/**
 * Proof band — the section the page was missing entirely. Three slots with a
 * permanent home so real proof drops straight in the moment it exists:
 *
 *   1. a real completed-action receipt (redacted screenshot of an actual
 *      executed action + payload + timestamp),
 *   2. a 60–90s demo video (the injected-email catch against a real tool),
 *   3. the builder line — one human sentence + @aethric.hq.
 *
 * Slots 1 and 2 are HONEST placeholders: labelled "coming" to the visitor,
 * never dressed up as a real receipt or a real recording. The builder line
 * is real today. Drop a redacted PNG into /public and a video id into the
 * embed to fill them — no layout shift, the frames are already sized.
 */
export function ProofBand() {
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-5 md:grid-cols-3">
      {/* 1 · real receipt slot */}
      <figure className="flex flex-col rounded-card bg-surface p-5 shadow-soft ring-1 ring-inset ring-ink/10">
        <div className="flex items-center gap-2 text-ink-soft">
          <FileCheck2 size={16} strokeWidth={2.4} aria-hidden="true" />
          <span className="text-[11px] font-bold lowercase tracking-wide">
            executed-action receipt
          </span>
        </div>
        {/* sized frame → no CLS when the real PNG lands */}
        <div className="mt-3 flex aspect-[4/3] flex-col justify-between rounded-btn bg-cream-deep/70 p-3">
          <div className="space-y-1.5">
            <div className="h-2 w-2/3 rounded-full bg-ink/10" />
            <div className="h-2 w-1/2 rounded-full bg-ink/10" />
          </div>
          <p className="font-mono text-[10px] leading-relaxed text-ink-soft/70">
            gmail.archive · 47 matches
            <br />
            2026-07-xx · signed by you
          </p>
        </div>
        <figcaption className="mt-3 text-[11px] font-semibold lowercase text-ink-soft">
          real redacted receipt — <span className="text-signal">coming with the founding cohort</span>
        </figcaption>
      </figure>

      {/* 2 · demo video slot */}
      <figure className="flex flex-col rounded-card bg-surface p-5 shadow-soft ring-1 ring-inset ring-ink/10">
        <div className="flex items-center gap-2 text-ink-soft">
          <PlayCircle size={16} strokeWidth={2.4} aria-hidden="true" />
          <span className="text-[11px] font-bold lowercase tracking-wide">
            90-second walkthrough
          </span>
        </div>
        <div className="mt-3 flex aspect-[4/3] items-center justify-center rounded-btn bg-ink/[0.92]">
          <span className="flex flex-col items-center gap-2 text-cream/70">
            <PlayCircle size={34} strokeWidth={1.6} aria-hidden="true" />
            <span className="text-[11px] font-semibold lowercase">the injected-email catch</span>
          </span>
        </div>
        <figcaption className="mt-3 text-[11px] font-semibold lowercase text-ink-soft">
          recorded against a real tool — <span className="text-signal">coming soon</span>
        </figcaption>
      </figure>

      {/* 3 · builder line (real today) */}
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
