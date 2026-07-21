import { MissionWorkspace } from "@/components/app/MissionWorkspace";

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
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-8">
      <MissionWorkspace missionId={id} />
    </div>
  );
}
