import { DecisionInbox } from "@/components/app/DecisionInbox";
import { getUserId } from "@/lib/auth";
import { servingAllowed } from "@/lib/env";
import { getStore } from "@/lib/store";
import { previewForActions } from "@/lib/workspace-model/approvalPreview";
import type { ActionWithPreview } from "@/components/app/DecisionInbox";

export const dynamic = "force-dynamic";

export const metadata = { title: "Approvals" };

/**
 * The Approval Inbox — only items that require human judgment. The waiting
 * queue is loaded server-side so the decisions are on screen at first paint;
 * the inbox then revalidates client-side (and any prefetch failure falls
 * back to the client loader unchanged).
 */
export default async function ApprovalsPage() {
  let initial: ActionWithPreview[] | undefined;
  try {
    if (servingAllowed()) {
      const userId = await getUserId();
      if (userId) {
        const actions = await getStore().listActions(userId, { status: "proposed", limit: 200 });
        // Same enrichment the API does, so the first paint already answers
        // "can this be undone?" rather than filling it in a beat later.
        const previews = await previewForActions(userId, actions);
        initial = actions.map((a) => (previews[a.id] ? { ...a, preview: previews[a.id] } : a));
      }
    }
  } catch {
    // fall through — DecisionInbox fetches client-side exactly as before
  }
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8">
      <h1 className="font-display text-2xl font-bold lowercase">approvals</h1>
      <p className="mt-1 text-sm font-semibold text-ink-soft">
        what AI is asking to do. each card says what will happen, how risky it is, and why.
        approving runs it; rejecting kills it. nothing runs on its own.
      </p>
      <div className="mt-6 flex-1">
        <DecisionInbox initial={initial} />
      </div>
    </div>
  );
}
