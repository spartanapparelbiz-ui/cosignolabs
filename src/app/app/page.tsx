import { Suspense } from "react";
import { Dashboard, type DashboardInitial } from "@/components/app/Dashboard";
import { FirstRunGate } from "@/components/FirstRunGate";
import { DashboardSkeleton } from "@/components/Skeleton";
import { getUserId } from "@/lib/auth";
import { servingAllowed } from "@/lib/env";
import { loadMissionOverview } from "@/lib/missions/overview";
import { loadingMessageFor } from "@/lib/loadingMessages";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata = { title: "home" };

/**
 * Home — what needs you today.
 *
 * The data is fetched INSIDE a Suspense boundary rather than above it, and
 * that one move is the difference between "the page appears, then fills in"
 * and "nothing at all until the slowest query returns". The shell, the rail
 * and the skeleton stream immediately; the dashboard replaces the skeleton the
 * moment its data lands. Nothing here can be held hostage by a slow store.
 *
 * Whatever the server does fetch is handed to the client, which seeds it into
 * the shared request cache — so the browser never re-asks for what already
 * arrived in the HTML.
 */
export default function AppPage() {
  return (
    <>
      <FirstRunGate />
      <Suspense fallback={<DashboardSkeleton message={loadingMessageFor("/app")} />}>
        <DashboardWithData />
      </Suspense>
    </>
  );
}

async function DashboardWithData() {
  let initial: DashboardInitial | undefined;
  try {
    if (servingAllowed()) {
      const userId = await getUserId();
      if (userId) {
        // In parallel: the approvals queue never waits on the mission
        // overview, or the page pays for both one after the other. The limit
        // matches PENDING_APPROVALS_KEY, so the client's shared cache is
        // seeded with exactly the response it would otherwise have requested.
        const [overview, approvals] = await Promise.all([
          loadMissionOverview(userId),
          getStore().listActions(userId, { status: "proposed", limit: 200 }),
        ]);
        initial = { missions: overview.missions, steps: overview.steps, approvals };
      }
    }
  } catch {
    // fall through — the Dashboard fetches client-side exactly as before
  }
  return <Dashboard initial={initial} />;
}
