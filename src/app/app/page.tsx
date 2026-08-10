import { OperatorHome } from "@/components/app/home/OperatorHome";
import { FirstRunIntro } from "@/components/FirstRunIntro";
import { getUserId } from "@/lib/auth";
import { servingAllowed } from "@/lib/env";
import { loadHome } from "@/lib/home/load";
import type { HomeModel } from "@/lib/home/model";

export const dynamic = "force-dynamic";

export const metadata = { title: "home" };

/**
 * Home — the operator's workspace.
 *
 * The whole model (missions with live steps, the decision queue, connected
 * apps and their health, today's counts, the feed) is loaded HERE, on the
 * server, in one parallel wave — so first paint already shows the state of
 * the work instead of eight skeletons waiting on a hydrate-then-fetch round
 * trip. Any failure falls back to the client-side loader; the page itself
 * never breaks on data.
 */
export default async function AppPage() {
  let initial: HomeModel | undefined;
  try {
    if (servingAllowed()) {
      const userId = await getUserId();
      if (userId) initial = await loadHome(userId);
    }
  } catch {
    // fall through — OperatorHome fetches /api/home client-side exactly as before
  }
  return (
    <>
      <FirstRunIntro />
      <OperatorHome initial={initial} />
    </>
  );
}
