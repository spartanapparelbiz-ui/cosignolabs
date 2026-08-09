import { ActivityStream } from "@/components/app/ActivityStream";

export const dynamic = "force-dynamic";

export const metadata = { title: "activity" };

/**
 * One history for the whole workspace: work, decisions, app changes, rule
 * changes. The filters narrow that one list — there is no second timeline.
 */
export default function ActivityPage() {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <h1 className="font-display text-2xl font-bold">Activity</h1>
      <p className="mt-1 text-sm font-semibold text-ink-soft">
        Everything that has happened in your workspace, newest first. Anything
        still waiting on you stays at the top.
      </p>
      <ActivityStream />
    </div>
  );
}
