import { TeamPanel } from "@/components/app/TeamPanel";

export const dynamic = "force-dynamic";

export const metadata = { title: "team" };

/** Team — workspace membership, roles, and delegated tier-2 decisions. */
export default function TeamPage() {
  return (
    <div className="page page-wide flex flex-1 flex-col">
      <header>
        <h1 className="page-title">team</h1>
        <p className="page-lede">Share decisions with people you trust — destructive ones always stay with their owner.</p>
      </header>
      <div className="mt-8 flex-1">
        <TeamPanel />
      </div>
    </div>
  );
}
