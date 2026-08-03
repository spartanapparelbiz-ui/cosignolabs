import { MissionHealth } from "@/components/app/MissionHealth";

export const dynamic = "force-dynamic";

export const metadata = { title: "Health" };

/** Deployment health — is background mission execution actually running? */
export default function HealthPage() {
  return (
    <div className="mx-auto flex w-full max-w-none flex-1 flex-col px-6 lg:px-10 py-8">
      <h1 className="font-display text-2xl font-bold lowercase">deployment health</h1>
      <p className="mt-1 text-sm font-semibold text-ink-soft">
        whether cosigno can move missions forward in the background — and every
        provider it depends on. no secrets, just status.
      </p>
      <div className="mt-6 flex-1">
        <MissionHealth />
      </div>
    </div>
  );
}
