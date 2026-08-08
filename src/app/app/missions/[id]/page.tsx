import { MissionWorkspace } from "@/components/app/MissionWorkspace";
import { Page } from "@/components/ui/Page";

export const dynamic = "force-dynamic";

/**
 * One mission, one workspace. Every command opens its own isolated page —
 * its plan, its timeline, its approvals, its results. Cards from different
 * missions can never mix here by construction: everything on this page is
 * loaded by this mission's id.
 */
export default async function MissionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Page width="work">
      <MissionWorkspace missionId={id} />
    </Page>
  );
}
