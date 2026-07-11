import Link from "next/link";
import { MissionList } from "@/components/app/MissionList";

export const dynamic = "force-dynamic";

/** Missions — every delegated goal as a persistent, trackable unit of work. */
export default function MissionsPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-bold lowercase">missions</h1>
          <p className="mt-1 text-sm font-semibold text-ink-soft">
            every goal you&apos;ve delegated — with its real state, derived from
            what actually executed, what you vetoed, and what still needs you.
          </p>
        </div>
        <Link
          href="/app"
          prefetch
          className="rounded-btn bg-signal px-4 py-2.5 text-sm font-extrabold text-ink shadow-soft transition-transform duration-fast hover:-translate-y-px active:scale-95"
        >
          new mission
        </Link>
      </div>
      <div className="mt-6 flex-1">
        <MissionList />
      </div>
    </div>
  );
}
