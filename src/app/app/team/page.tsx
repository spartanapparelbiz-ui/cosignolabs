import { TeamPanel } from "@/components/app/TeamPanel";

export const dynamic = "force-dynamic";

/** Team — workspace membership, roles, and delegated tier-2 decisions. */
export default function TeamPage() {
  return (
    <div className="mx-auto flex w-full max-w-none flex-1 flex-col px-6 lg:px-10 py-8">
      <h1 className="font-display text-2xl font-bold lowercase">team</h1>
      <p className="mt-1 text-sm font-semibold text-ink-soft">
        share decisions with people you trust. approvers can sign off on each
        other&apos;s routine actions — destructive ones always stay with their
        owner.
      </p>
      <div className="mt-6 flex-1">
        <TeamPanel />
      </div>
    </div>
  );
}
