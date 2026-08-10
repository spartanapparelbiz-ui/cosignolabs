import { ActivityStream } from "@/components/app/ActivityStream";

export const dynamic = "force-dynamic";

export const metadata = { title: "activity" };

/**
 * One history for the whole workspace: work, decisions, app changes, rule
 * changes. The filters narrow that one list — there is no second timeline.
 */
export default function ActivityPage() {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <header className="animate-blur-in">
        <h1 className="font-display text-display-md font-bold lowercase">activity</h1>
        <p className="mt-2 max-w-xl text-pretty text-sm font-semibold leading-relaxed text-ink-soft">
          everything that has happened in your workspace, newest first. anything
          still waiting on you stays at the top.
        </p>
      </header>
      <ActivityStream />
    </div>
  );
}
