import { Inbox, Reply, Sunrise } from "lucide-react";
import { Reveal } from "@/components/Reveal";

/**
 * The outcome strip — three results, straight under the hero. Each line is
 * backed by a shipped job; no outcome is listed that the product can't
 * produce today.
 */

const OUTCOMES = [
  {
    icon: Inbox,
    title: "inbox cleared",
    body: "clutter archived only after you sign — nothing is ever deleted.",
  },
  {
    icon: Reply,
    title: "replies prepared",
    body: "drafts written and saved for every waiting thread. drafts can't send.",
  },
  {
    icon: Sunrise,
    title: "calendar protected",
    body: "send times and reminders checked against your real free/busy.",
  },
] as const;

export function OutcomeStrip() {
  return (
    <section className="border-y border-line/50 bg-surface/60">
      <div className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-8 sm:grid-cols-3">
        {OUTCOMES.map((o, i) => (
          <Reveal key={o.title} delay={i * 70} className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-btn bg-cream-deep">
              <o.icon size={16} className="text-ink-soft" aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-sm font-extrabold lowercase">{o.title}</h3>
              <p className="mt-0.5 text-xs font-semibold leading-relaxed text-ink-soft">{o.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
