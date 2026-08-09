import { AccountCenter } from "@/components/account/AccountCenter";

export const dynamic = "force-dynamic";

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  return (
    <div className="mx-auto w-full max-w-none flex-1 px-6 lg:px-10 py-6">
      <h1 className="text-xl font-extrabold lowercase">account</h1>
      <p className="mt-1 text-sm text-ink-soft">
        your plan, usage, and billing.
      </p>
      {status === "success" && (
        <div className="mt-4 rounded-card bg-signal px-4 py-3 text-sm font-bold text-on-signal shadow-soft">
          you&apos;re all set — your plan is active. it may take a moment to
          reflect here.
        </div>
      )}
      <AccountCenter initialTab="usage" />
    </div>
  );
}
