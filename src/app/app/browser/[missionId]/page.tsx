import { BrowserOperatorView } from "@/components/app/BrowserOperatorView";

export const dynamic = "force-dynamic";

/**
 * The browser view — watch cosigno research real pages for one mission:
 * the current page on the left, what it's doing / what it found / what's
 * next on the right. Read-only by design; pause and stop are always at hand.
 */
export default async function BrowserMissionPage({
  params,
}: {
  params: Promise<{ missionId: string }>;
}) {
  const { missionId } = await params;
  return (
    <div className="mx-auto flex w-full max-w-none flex-1 flex-col px-6 lg:px-10 py-8">
      <BrowserOperatorView missionId={missionId} />
    </div>
  );
}
