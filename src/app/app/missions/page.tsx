import Link from "next/link";
import { MissionList } from "@/components/app/MissionList";
import { MissionRunner } from "@/components/app/MissionRunner";
import { ForksExplorer } from "@/components/missions/ForksExplorer";

export const dynamic = "force-dynamic";

/** Delegations — every outcome handed to cosigno, active until it's done. */
export default function MissionsPage() {
  return (
    <div className="mx-auto flex w-full max-w-none flex-1 flex-col px-6 lg:px-10 py-8">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-bold lowercase">delegations</h1>
          <p className="mt-1 text-sm font-semibold text-ink-soft">
            every outcome you&apos;ve handed to cosigno — with its real momentum,
            derived from what actually executed, what you vetoed, and what
            still needs you. delegate outcomes, not steps.
          </p>
        </div>
        <Link
          href="/app"
          prefetch
          className="rounded-btn bg-signal px-4 py-2.5 text-sm font-extrabold text-ink shadow-soft transition-transform duration-fast hover:-translate-y-px active:scale-95"
        >
          new delegation
        </Link>
      </div>
      <div className="mt-6">
        <MissionRunner />
      </div>
      <div className="mt-4">
        <ForksExplorer />
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
