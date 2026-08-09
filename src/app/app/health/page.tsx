import { MissionHealth } from "@/components/app/MissionHealth";

export const dynamic = "force-dynamic";

export const metadata = { title: "diagnostics" };

/**
 * Diagnostics — the one place infrastructure vocabulary belongs.
 *
 * Everywhere else says what happened, why, and who can fix it. This page is
 * for the person who CAN fix it, so it names the setting to change. Keeping
 * that language here and nowhere else is the whole separation: a founder is
 * never handed a variable name they cannot act on, and an administrator never
 * has to guess which one we meant.
 */
export default function HealthPage() {
  return (
    <div className="mx-auto flex w-full max-w-none flex-1 flex-col px-6 lg:px-10 py-8">
      <h1 className="font-display text-2xl font-bold">Diagnostics</h1>
      <p className="mt-1 text-sm font-semibold text-ink-soft">
        for whoever set this workspace up: which services are switched on, and what to
        change if one isn&apos;t. names of settings only — never their values.
      </p>
      <div className="mt-6 flex-1">
        <MissionHealth />
      </div>
    </div>
  );
}
