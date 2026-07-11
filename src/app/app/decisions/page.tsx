import { DecisionInbox } from "@/components/app/DecisionInbox";

export const dynamic = "force-dynamic";

/** The Decision Inbox — only items that require human judgment. */
export default function DecisionsPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8">
      <h1 className="font-display text-2xl font-bold lowercase">decisions</h1>
      <p className="mt-1 text-sm font-semibold text-ink-soft">
        every action waiting for your sign-off, across all your missions.
        approving executes it; vetoing kills it. nothing runs on its own.
      </p>
      <div className="mt-6 flex-1">
        <DecisionInbox />
      </div>
    </div>
  );
}
