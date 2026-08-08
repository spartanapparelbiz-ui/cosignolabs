import { ObjectivesPanel } from "@/components/app/ObjectivesPanel";
import { Page, PageHeader } from "@/components/ui/Page";

export const dynamic = "force-dynamic";

export const metadata = { title: "objectives" };

/**
 * Objectives — the layer above missions. Outcomes the user owns over time;
 * cosigno derives progress from the real state of the missions linked to each
 * one. The user gives the destination; cosigno keeps it moving and returns
 * only when authority is needed.
 */
export default function ObjectivesPage() {
  return (
    <Page width="work">
      <PageHeader
        title="What are you trying to reach?"
        description="Outcomes you own over time. Hand over the pieces, and cosigno tracks what contributes, what's done and what's blocked."
      />
      <div className="mt-12 flex-1">
        <ObjectivesPanel />
      </div>
    </Page>
  );
}
