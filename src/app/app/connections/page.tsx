import { ConnectionsPanel } from "@/components/account/ConnectionsPanel";
import { PermissionRules } from "@/components/account/PermissionRules";
import { AdaptiveDashboard } from "@/components/app/AdaptiveDashboard";

export const dynamic = "force-dynamic";

export const metadata = { title: "connections" };

/** Connections — the apps cosigno can work with, on their own page. */
export default function ConnectionsPage() {
  return (
    <div className="mx-auto flex w-full max-w-none flex-1 flex-col px-6 lg:px-10 py-8">
      <h1 className="font-display text-2xl font-bold">Connections</h1>
      <p className="mt-1 text-sm font-semibold text-ink-soft">
        The apps cosigno can work with — email, calendar, files, and more.
        cosigno can only touch an app after you connect it.
      </p>
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
