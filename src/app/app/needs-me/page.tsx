import { RadarView } from "@/components/radar/RadarView";

export const dynamic = "force-dynamic";

/**
 * Needs Me — Cosigno Radar. Proactive detection over your authorized state:
 * what's at risk, forgotten, waiting, or worth doing next. Radar only ever
 * suggests or PREPARES work; nothing consequential happens without your
 * approval or signature.
 */
export default function NeedsMePage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 lg:px-10 py-8">
      <h1 className="font-display text-2xl font-bold lowercase">needs me</h1>
      <p className="mt-1 mb-6 text-sm font-semibold text-ink-soft">
        cosigno radar watches your prepared work, missions, connections, and
        billing for what needs a decision — a card aging out, a mission that
        stalled, an app that quietly disconnected. it separates what it{" "}
        <em>observed</em> from what it <em>infers</em>, and it never acts on its
        own: the strongest thing it can do is prepare a mission for your
        approval.
      </p>
      <RadarView />
    </div>
  );
}
