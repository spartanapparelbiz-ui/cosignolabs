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
      <h1 className="font-display text-2xl font-bold">Plan &amp; billing</h1>
      <p className="mt-1 text-sm font-semibold text-ink-soft">
        What you&apos;re on, what you&apos;ve used, and how to change it.
      </p>
      {status === "success" && (
        <div className="mt-4 rounded-card bg-signal px-4 py-3 text-sm font-bold text-ink shadow-soft">
          you&apos;re all set — your plan is active. it may take a moment to
          reflect here.
        </div>
      )}
      <AccountCenter initialTab="usage" />
    </div>
  );
}
