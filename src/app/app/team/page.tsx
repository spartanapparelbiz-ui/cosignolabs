import { TeamPanel } from "@/components/app/TeamPanel";
import { Page, PageHeader } from "@/components/ui/Page";

export const dynamic = "force-dynamic";

export const metadata = { title: "team" };

/** Team — workspace membership, roles, and delegated tier-2 decisions. */
export default function TeamPage() {
  return (
    <Page width="work">
      <PageHeader
        title="Who else can decide?"
        description="Approvers can sign off on each other's routine actions. Destructive ones always stay with their owner."
      />
      <div className="mt-12 flex-1">
        <TeamPanel />
      </div>
    </Page>
  );
}
