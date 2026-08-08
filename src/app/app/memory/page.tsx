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
    <div className="page page-wide flex flex-1 flex-col">
      <header>
        <h1 className="page-title">my rules & memory</h1>
        <p className="page-lede">What cosigno reads before it plans anything.</p>
      </header>
      <div className="mt-8 flex-1">
        <MemoryPanel />
      </div>
    </div>
  );
}
