import { ObjectivesPanel } from "@/components/app/ObjectivesPanel";

export const dynamic = "force-dynamic";

export const metadata = { title: "objectives" };

/**
 * Objectives — the layer above Delegations. Outcomes the user owns over
 * time; cosigno derives progress from the real state of the delegations
 * linked to each one. The user gives the destination; cosigno keeps it
 * moving and returns only when authority is needed.
 */
export default function ObjectivesPage() {
  return (
    <div className="mx-auto flex w-full max-w-none flex-1 flex-col px-6 lg:px-10 py-8">
      <h1 className="font-display text-2xl font-bold">Objectives</h1>
      <p className="mt-1 text-sm font-semibold text-ink-soft">
        outcomes you own over time. delegate the pieces; cosigno understands what contributes,
        what&apos;s complete, what&apos;s blocked, and what can happen next.
      </p>
      <div className="mt-6 flex-1">
        <ObjectivesPanel />
      </div>
    </div>
  );
}
