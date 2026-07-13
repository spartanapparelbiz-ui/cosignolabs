import { ConnectionsPanel } from "@/components/account/ConnectionsPanel";

export const dynamic = "force-dynamic";

/** Connections — the apps cosigno can work with, on their own page. */
export default function ConnectionsPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8">
      <h1 className="font-display text-2xl font-bold lowercase">connections</h1>
      <p className="mt-1 text-sm font-semibold text-ink-soft">
        the apps cosigno can work with — email, calendar, files, and more.
        cosigno can only touch an app after you connect it.
      </p>
      <div className="mt-6 flex-1">
        <ConnectionsPanel />
      </div>
    </div>
  );
}
