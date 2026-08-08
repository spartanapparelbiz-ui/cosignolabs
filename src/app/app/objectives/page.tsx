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
    <div className="page page-wide flex flex-1 flex-col">
      <header>
        <h1 className="page-title">objectives</h1>
        <p className="page-lede">Outcomes you own over time; cosigno keeps the pieces moving.</p>
      </header>
      <div className="mt-8 flex-1">
        <ObjectivesPanel />
      </div>
    </div>
  );
}
