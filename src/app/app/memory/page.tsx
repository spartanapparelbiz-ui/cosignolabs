import { MemoryPanel } from "@/components/app/MemoryPanel";

export const dynamic = "force-dynamic";

export const metadata = { title: "memory" };

/**
 * My Rules & Memory — user-controlled operating principles and context the
 * planner reads on every delegation. Never agent-written. Explicit rules
 * override inferred preferences, and cosigno never silently changes one —
 * the hard permission boundaries (tiers, SIGN, locked actions) are enforced
 * by the server regardless of what's written here.
 */
export default function MemoryPage() {
  return (
    <div className="mx-auto flex w-full max-w-none flex-1 flex-col px-6 lg:px-10 py-8">
      <h1 className="font-display text-2xl font-bold">My rules &amp; memory</h1>
      <p className="mt-1 text-sm font-semibold text-ink-soft">
        your standing operating principles, in plain language — &ldquo;always prepare
        external emails for review,&rdquo; &ldquo;never cancel a meeting without asking.&rdquo;
        the operator reads every enabled rule as explicit context on every
        delegation. only you write here; explicit rules override anything
        cosigno has inferred, and one switch turns it all off. the hard limits —
        signatures and locked actions — hold either way, and nothing you write
        here can loosen them.
      </p>
      <div className="mt-6 flex-1">
        <MemoryPanel />
      </div>
    </div>
  );
}
