import { ConnectionsPanel } from "@/components/account/ConnectionsPanel";
import { PermissionRules } from "@/components/account/PermissionRules";
import { AdaptiveDashboard } from "@/components/app/AdaptiveDashboard";

export const dynamic = "force-dynamic";

export const metadata = { title: "connections" };

/** Connections — the apps cosigno can work with, on their own page. */
export default function ConnectionsPage() {
  return (
    <div className="mx-auto flex w-full max-w-none flex-1 flex-col px-6 py-10 lg:px-10">
      <header className="animate-blur-in">
        <h1 className="font-display text-display-md font-bold lowercase">connections</h1>
        <p className="mt-2 max-w-xl text-pretty text-sm font-semibold leading-relaxed text-ink-soft">
          the apps cosigno can work with — email, calendar, files, and more.
          cosigno can only touch an app after you connect it, and every app you
          add is more it can do without asking you to do it yourself.
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
