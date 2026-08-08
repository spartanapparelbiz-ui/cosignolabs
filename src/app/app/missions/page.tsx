import { MissionRunner } from "@/components/app/MissionRunner";
import { getUserId } from "@/lib/auth";
import { servingAllowed } from "@/lib/env";
import { getStore } from "@/lib/store";
import type { MissionRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "missions" };

/**
 * Delegations — every outcome handed to cosigno, active until it's done.
 *
 * This page used to show the same work twice: the mission list, and below it a
 * second list called "command threads" built from sessions and a 1000-row
 * action fetch, describing the identical missions in a different vocabulary.
 * Two lists of one thing is not more information, it is a question about which
 * one is real — and it cost the page its slowest request. One list now.
 *
 * The list is loaded server-side so it is on screen at first paint;
 * MissionRunner then revalidates client-side.
 */
export default async function MissionsPage() {
  let initial: MissionRecord[] | undefined;
  try {
    if (servingAllowed()) {
      const userId = await getUserId();
      if (userId) {
        initial = await getStore().listMissions(userId, 25);
      }
    }
  } catch {
    // fall through — MissionRunner fetches client-side exactly as before
  }
  return (
    <div className="page">
      <header>
        <h1 className="page-title">delegations</h1>
        <p className="page-lede">
          Everything you&apos;ve handed to cosigno, with what it has actually done.
        </p>
      </header>
      <div className="mt-8">
        <MissionRunner initial={initial} />
      </div>
    </div>
  );
}
