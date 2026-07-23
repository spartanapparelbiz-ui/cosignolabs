import { Reveal } from "@/components/Reveal";

/**
 * "Why not another chatbot?" — the positioning table. Three columns; the
 * cosigno column claims only shipped behavior (action cards, receipts,
 * server-enforced tiers).
 */

const ROWS: [string, string, string][] = [
  ["gives instructions", "runs fixed rules", "carries a goal across your apps"],
  ["you do the work", "breaks when context changes", "plans and adapts, step by step"],
  ["no execution receipt", "hard to inspect", "exact approval cards and receipts"],
  ["chat approval is vague", "often runs unattended", "server-enforced authority tiers"],
];

export function Comparison() {
  return (
    <section className="bg-cream-deep/50">
      <div className="mx-auto w-full max-w-5xl px-4 py-16">
        <Reveal className="text-center">
          <h2 className="font-display text-2xl font-bold lowercase sm:text-3xl">
            why not another chatbot?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm font-semibold text-ink-soft">
            chat gives advice. automation runs blind. an operator does the work
            and stops for your signature.
          </p>
        </Reveal>
        <Reveal className="mt-8 overflow-x-auto rounded-card border border-line/70 bg-surface shadow-soft">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-line/70">
                <th className="px-4 py-3 text-xs font-extrabold lowercase text-ink-soft">chat assistant</th>
                <th className="px-4 py-3 text-xs font-extrabold lowercase text-ink-soft">traditional automation</th>
                <th className="bg-signal/[0.07] px-4 py-3 text-xs font-extrabold lowercase text-signal">cosigno</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map(([chat, auto, cosigno]) => (
                <tr key={cosigno} className="border-b border-line/40 last:border-0">
                  <td className="px-4 py-3 font-semibold text-ink-soft">{chat}</td>
                  <td className="px-4 py-3 font-semibold text-ink-soft">{auto}</td>
                  <td className="bg-signal/[0.07] px-4 py-3 font-bold text-ink">{cosigno}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Reveal>
      </div>
    </section>
  );
}
