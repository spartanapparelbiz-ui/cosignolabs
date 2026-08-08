import { Suspense } from "react";
import { DecisionInbox } from "@/components/app/DecisionInbox";
import { SkeletonCard } from "@/components/Skeleton";
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
export default function ApprovalsPage() {
  return (
    <div className="page flex flex-1 flex-col">
      <header>
        <h1 className="page-title">approvals</h1>
        <p className="page-lede">Nothing here runs until you decide.</p>
      </header>
      <div className="mt-8 flex-1">
        {/* The heading is on screen before the queue is even queried. */}
        <Suspense fallback={<SkeletonCard />}>
          <Queue />
        </Suspense>
      </div>
    </div>
  );
}

async function Queue() {
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
  return <DecisionInbox initial={initial} />;
}
