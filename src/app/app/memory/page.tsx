import { MemoryPanel } from "@/components/app/MemoryPanel";

export const dynamic = "force-dynamic";

/** Memory — user-controlled context the planner reads. Never agent-written. */
export default function MemoryPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8">
      <h1 className="font-display text-2xl font-bold lowercase">memory</h1>
      <p className="mt-1 text-sm font-semibold text-ink-soft">
        short notes you save about how you like things done — the operator
        reads them as context. only you write here, and one switch turns it
        all off.
      </p>
      <div className="mt-6 flex-1">
        <MemoryPanel />
      </div>
    </div>
  );
}
