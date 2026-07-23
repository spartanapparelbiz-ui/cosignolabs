import { ReceiptsView } from "@/components/receipts/ReceiptsView";

export const dynamic = "force-dynamic";

/**
 * Receipts — the Proof layer. Every external action cosigno attempts produces
 * an immutable receipt: what ran, who authorized it and how, the exact
 * operation, the result, whether it's reversible, and the correlation id that
 * ties it to the audit trail. Nothing here can be edited after the fact.
 */
export default function ReceiptsPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 lg:px-10 py-8">
      <h1 className="font-display text-2xl font-bold lowercase">receipts</h1>
      <p className="mt-1 mb-6 text-sm font-semibold text-ink-soft">
        the proof that what you approved is exactly what ran. every attempted
        action — executed, failed, or blocked at the gate — writes an immutable
        receipt with its authorization, exact operation, result, reversibility,
        and correlation id. receipts never store tokens or full message bodies.
      </p>
      <ReceiptsView />
    </div>
  );
}
