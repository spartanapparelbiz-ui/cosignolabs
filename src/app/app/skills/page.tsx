import { SkillsPanel } from "@/components/app/SkillsPanel";
import { Page, PageHeader } from "@/components/ui/Page";

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
    <Page width="work">
      <PageHeader
        title="What should cosigno already know?"
        description="A skill installs a few named watches and preparation rules. Nothing more, and uninstalling removes exactly what it created."
      />
      <div className="mt-12 flex-1">
        <SkillsPanel />
      </div>
    </Page>
  );
}
