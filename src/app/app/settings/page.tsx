import { SettingsPanel } from "@/components/SettingsPanel";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
      <h1 className="text-xl font-extrabold">Settings</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Decide how much rope the operator gets. Tier 3 stays locked no matter
        what — that&apos;s the point.
      </p>
      <SettingsPanel />
    </div>
  );
}
