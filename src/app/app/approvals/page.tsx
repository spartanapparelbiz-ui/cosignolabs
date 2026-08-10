import { DecisionInbox } from "@/components/app/DecisionInbox";
import { getUserId } from "@/lib/auth";
import { servingAllowed } from "@/lib/env";
import { getStore } from "@/lib/store";
import type { ActionRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "approvals" };

/**
 * The Approval Inbox — only items that require human judgment. The waiting
 * queue is loaded server-side so the decisions are on screen at first paint;
 * the inbox then revalidates client-side (and any prefetch failure falls
 * back to the client loader unchanged).
 */
export default async function ApprovalsPage() {
  let initial: ActionRecord[] | undefined;
  try {
    if (servingAllowed()) {
      const userId = await getUserId();
      if (userId) {
        initial = await getStore().listActions(userId, { status: "proposed", limit: 200 });
      }
    }
  } catch {
    // fall through — DecisionInbox fetches client-side exactly as before
  }
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-10">
      <header className="animate-blur-in">
        <h1 className="font-display text-display-md font-bold lowercase">approvals</h1>
        <p className="mt-2 max-w-xl text-pretty text-sm font-semibold leading-relaxed text-ink-soft">
          every action waiting for your signature, across all your missions.
          each one carries what it does, what it touches, and whether it can be
          undone — approving executes it, vetoing kills it, and nothing runs on
          its own.
        </p>
      </header>
      <div className="mt-7 flex-1">
        <DecisionInbox initial={initial} />
      </div>
    </div>
  );
}
