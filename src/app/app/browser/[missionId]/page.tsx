import { BrowserOperatorView } from "@/components/app/BrowserOperatorView";
import { Page } from "@/components/ui/Page";

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
    <Page width="wide">
      <BrowserOperatorView missionId={missionId} />
    </Page>
  );
}
