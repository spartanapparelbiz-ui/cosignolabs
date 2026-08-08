import { ActivityStream } from "@/components/app/ActivityStream";
import { Page, PageHeader } from "@/components/ui/Page";

export const dynamic = "force-dynamic";

export const metadata = { title: "activity" };

/**
 * One history for the whole workspace: work, decisions, app changes, rule
 * changes. The filters narrow that one list — there is no second timeline.
 */
export default function ActivityPage() {
  return (
    <Page>
      <PageHeader
        title="What changed?"
        description="Everything that has happened here, newest first. Anything still waiting on you stays at the top."
      />
      <div className="mt-12">
        <ActivityStream />
      </div>
    </Page>
  );
}
