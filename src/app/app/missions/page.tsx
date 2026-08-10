import Link from "next/link";
import { MissionList } from "@/components/app/MissionList";
import { MissionRunner } from "@/components/app/MissionRunner";
import { getUserId } from "@/lib/auth";
import { servingAllowed } from "@/lib/env";
import { getStore } from "@/lib/store";
import type { MissionRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "missions" };

/**
 * Delegations — every outcome handed to cosigno, active until it's done.
 * The mission list is loaded server-side so it's on screen at first paint;
 * MissionRunner then revalidates client-side (prefetch failures fall back
 * to the client loader unchanged).
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
    <div className="mx-auto flex w-full max-w-none flex-1 flex-col px-6 py-10 lg:px-10">
      <div className="flex animate-blur-in flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-display-md font-bold lowercase">delegations</h1>
          <p className="mt-2 max-w-xl text-pretty text-sm font-semibold leading-relaxed text-ink-soft">
            every outcome you&apos;ve handed to cosigno — with its real momentum,
            derived from what actually executed, what you vetoed, and what
            still needs you. delegate outcomes, not steps.
          </p>
        </div>
        <Link
          href="/app"
          prefetch
          className="rounded-btn bg-signal px-4 py-2.5 text-sm font-extrabold text-on-signal shadow-soft transition-[transform,box-shadow] duration-fast ease-brand-out hover:-translate-y-px hover:shadow-lift active:translate-y-0 active:scale-95 motion-reduce:hover:translate-y-0"
        >
          new delegation
        </Link>
      </div>
      <div className="mt-6">
        <MissionRunner initial={initial} />
      </div>
      <h2 className="mt-8 text-sm font-extrabold lowercase tracking-widest text-ink-soft">
        command threads
      </h2>
      <div className="mt-3 flex-1">
        <MissionList />
      </div>
    </div>
  );
}
