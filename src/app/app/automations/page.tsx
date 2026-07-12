import { AutomationsPanel } from "@/components/app/AutomationsPanel";

export const dynamic = "force-dynamic";

/** Automations — recurring missions with run-now, pause, and history. */
export default function AutomationsPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8">
      <h1 className="font-display text-2xl font-bold lowercase">automations</h1>
      <p className="mt-1 text-sm font-semibold text-ink-soft">
        repeated work, on a schedule — planned by the operator, gated by your
        signature, logged like everything else.
      </p>
      <div className="mt-6 flex-1">
        <AutomationsPanel />
      </div>
    </div>
  );
}
