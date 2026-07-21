/**
 * Who's building this — the one honest, real thing the page can stand behind
 * today: accurate founder information. The former receipt/video slots were
 * removed because a "proof" section must not contain "coming soon" placeholders
 * dressed up as evidence. When a real redacted receipt and a real recorded
 * walkthrough exist, add them back here as genuine assets — not before.
 */
export function ProofBand() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <figure className="flex flex-col justify-between rounded-card bg-ink p-6 text-cream shadow-soft sm:p-8">
        <div>
          <span className="text-[11px] font-bold lowercase tracking-wide text-cream/60">
            who&apos;s building this
          </span>
          <p className="mt-3 text-lg font-semibold leading-relaxed">
            i&apos;m a solo builder at aethric. i wanted an agent i could trust
            with real work — one that asks before it sends, and logs everything
            it does. so i&apos;m building it in the open, cohort by cohort.
          </p>
        </div>
        <a
          href="https://instagram.com/aethric.hq"
          className="mt-5 inline-block text-[14px] font-extrabold lowercase text-signal underline-offset-2 hover:underline"
        >
          @aethric.hq
        </a>
      </figure>
    </div>
  );
}
