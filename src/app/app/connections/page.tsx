import { ConnectionsPanel } from "@/components/account/ConnectionsPanel";
import { PermissionRules } from "@/components/account/PermissionRules";
import { AdaptiveDashboard } from "@/components/app/AdaptiveDashboard";

export const dynamic = "force-dynamic";

export const metadata = { title: "connections" };

/** Connections — the apps cosigno can work with, on their own page. */
export default function ConnectionsPage() {
  return (
    <div className="page page-wide flex flex-1 flex-col">
      <header>
        <h1 className="page-title">connections</h1>
        <p className="page-lede">
          cosigno can only touch an app after you connect it.
        </p>
      </header>
      {/* What each connected app actually holds, and what's happening in it.
          This used to sit on home, where repository counts were the first
          thing anyone saw — it belongs with the apps themselves. */}
      <div className="mt-6">
        <AdaptiveDashboard />
      </div>

      <div className="flex-1">
        {/* The page's own h1 already says "connections"; this panel renders
            no heading of its own, so the word appears exactly once. */}
        <ConnectionsPanel />
      </div>
      <hr className="my-8 border-ink/10" />
      <PermissionRules />
    </div>
  );
}
