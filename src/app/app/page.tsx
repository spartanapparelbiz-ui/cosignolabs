import { Dashboard, type DashboardInitial } from "@/components/app/Dashboard";
import { getUserId } from "@/lib/auth";
import { servingAllowed } from "@/lib/env";
import { loadMissionOverview } from "@/lib/missions/overview";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata = { title: "home" };

/**
 * Home — the whole product on one calm page: what do you want done, what
 * needs you, what is happening, what changed.
 *
 * There is no onboarding in front of this. cosigno used to open on a modal
 * asking new arrivals what stole the most of their time, which is a
 * reasonable question and exactly the wrong way to start: it makes someone
 * answer a survey before they have any idea what the answers do, and the
 * one thing a first-time user actually needs is to see that they can type
 * a sentence and something happens. The six examples in the empty state
 * teach the same thing without a gate in the way.
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
  return <Dashboard initial={initial} />;
}
