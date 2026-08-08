import { ActivityStream } from "@/components/app/ActivityStream";

export const dynamic = "force-dynamic";

export const metadata = { title: "activity" };

/**
 * One history for the whole workspace: work, decisions, app changes, rule
 * changes. The filters narrow that one list — there is no second timeline.
 */
export default function ActivityPage() {
  return (
    <div className="page flex-1">
      <header>
        <h1 className="page-title">activity</h1>
        <p className="page-lede">Everything that has happened here, newest first.</p>
      </header>
      <ActivityStream />
    </div>
  );
}
