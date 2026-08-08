import { DecisionInbox } from "@/components/app/DecisionInbox";
import { Page, PageHeader } from "@/components/ui/Page";
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
    <Page>
      <PageHeader
        title="What needs your decision?"
        description="Approving runs it. Vetoing ends it. Nothing here runs on its own."
      />
      <div className="mt-12 flex-1">
        <DecisionInbox initial={initial} />
      </div>
    </Page>
  );
}
