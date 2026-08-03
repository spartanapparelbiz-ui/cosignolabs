import { Dashboard, type DashboardInitial } from "@/components/app/Dashboard";
import { FirstRunIntro } from "@/components/FirstRunIntro";
import { getUserId } from "@/lib/auth";
import { servingAllowed } from "@/lib/env";
import { loadMissionOverview } from "@/lib/missions/overview";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata = { title: "Dashboard" };

/**
 * Home — the clean dashboard. Four questions, one calm page: what to ask,
 * what's in progress, what needs approval, what's finished.
 *
 * The primary content (missions + steps + approvals) is loaded HERE, on the
 * server, in parallel — so the first paint already shows real work instead
 * of skeletons waiting on a hydrate-then-fetch round trip. Any failure falls
 * back to the client-side loader; the page itself never breaks on data.
 */
export default async function AppPage() {
  let initial: DashboardInitial | undefined;
  try {
    if (servingAllowed()) {
      const userId = await getUserId();
      if (userId) {
        const [overview, approvals] = await Promise.all([
          loadMissionOverview(userId),
          getStore().listActions(userId, { status: "proposed", limit: 20 }),
        ]);
        initial = { missions: overview.missions, steps: overview.steps, approvals };
      }
    }
  } catch {
    // fall through — the Dashboard fetches client-side exactly as before
  }
  return (
    <>
      <FirstRunIntro />
      <Dashboard initial={initial} />
    </>
  );
}
