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
      <h1 className="font-display text-2xl font-bold lowercase">my rules &amp; memory</h1>
      <p className="mt-1 text-sm font-semibold text-ink-soft">
        your standing operating principles, in plain language — &ldquo;always prepare
        external emails for review,&rdquo; &ldquo;never cancel a meeting without asking.&rdquo;
        the operator reads every enabled rule as explicit context on every
        delegation. only you write the rules; below them, cosigno shows what it
        has worked out from your own approvals, edits and vetoes — with the
        count behind each one, and a switch to drop any of it. what you write
        beats what it inferred, and one switch turns it all off. the hard
        limits — signatures and locked actions — hold either way, and nothing
        here can loosen them.
      </p>
      <div className="mt-6 flex-1">
        <MemoryPanel />
      </div>
    </div>
  );
}
