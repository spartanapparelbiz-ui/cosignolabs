import { MissionRunner } from "@/components/app/MissionRunner";
import { getUserId } from "@/lib/auth";
import { servingAllowed } from "@/lib/env";
import { getStore } from "@/lib/store";
import type { MissionRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "missions" };

/**
 * Missions — everything you've handed to cosigno, in one scannable list.
 *
 * This page used to carry two different lists under two different names
 * ("delegations" and "command threads"), built on two different models, which
 * meant the honest answer to "how many missions do I have?" depended on which
 * half of the page you were looking at. One list now, one word for it, and
 * every mission opens its own page.
 *
 * The list is loaded server-side so it's on screen at first paint; the client
 * then revalidates (and a prefetch failure falls back to the client loader
 * unchanged).
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
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8">
      <div className="flex flex-wrap items-start gap-3">
        {/* The "start something" control lives in the list itself, which knows
            whether the page is empty — an empty page already has one in the
            middle of it, and two identical orange buttons split the attention
            they exist to focus. */}
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-bold">Missions</h1>
          <p className="mt-1 text-sm font-semibold text-ink-soft">
            Everything you&apos;ve asked cosigno to get done. You tell it the
            outcome; it works out the steps and asks you before anything that
            matters.
          </p>
        </div>
      </div>
      <div className="mt-6 flex-1">
        <MissionRunner initial={initial} />
      </div>
    </div>
  );
}
