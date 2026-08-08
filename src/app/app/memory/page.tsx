import { MemoryPanel } from "@/components/app/MemoryPanel";
import { Page, PageHeader } from "@/components/ui/Page";

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
    <Page width="work">
      <PageHeader
        title="What should cosigno remember?"
        description="Standing instructions in your own words. cosigno reads every enabled one before it plans. Only you write here, and nothing written here can loosen a limit."
      />
      <div className="mt-12 flex-1">
        <MemoryPanel />
      </div>
    </Page>
  );
}
