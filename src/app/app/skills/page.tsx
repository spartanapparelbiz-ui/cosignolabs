import { SkillsPanel } from "@/components/app/SkillsPanel";

export const dynamic = "force-dynamic";

export const metadata = { title: "skills" };

/**
 * Skills — installable capability packs. Installing one creates a small,
 * named set of watches and preparation rules so cosigno is useful
 * immediately; everything a skill prepares still stops at your approval or
 * signature. Uninstalling removes exactly what it created.
 */
export default function SkillsPage() {
  return (
    <div className="mx-auto w-full max-w-none flex-1 px-6 lg:px-10 py-6">
      <h1 className="text-xl font-extrabold lowercase">skills</h1>
      <p className="mt-1 max-w-2xl text-sm text-ink-soft">
        Preconfigured operators for the work you already do. A skill installs a few named
        watches and preparation rules — nothing more. Everything they prepare waits for your
        approval or signature, and uninstalling removes exactly what they created.
      </p>
      <SkillsPanel />
    </div>
  );
}
