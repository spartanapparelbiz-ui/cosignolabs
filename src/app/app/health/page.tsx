import { MissionHealth } from "@/components/app/MissionHealth";
import { Page, PageHeader } from "@/components/ui/Page";

export const dynamic = "force-dynamic";

export const metadata = { title: "diagnostics" };

/**
 * Diagnostics — the one place infrastructure vocabulary belongs.
 *
 * Everywhere else says what happened, why, and who can fix it. This page is
 * for the person who CAN fix it, so it names the setting to change. Keeping
 * that language here and nowhere else is the whole separation: a founder is
 * never handed a variable name they cannot act on, and an administrator never
 * has to guess which one we meant.
 */
export default function HealthPage() {
  return (
    <Page width="work">
      <PageHeader
        title="Is this workspace set up?"
        description="For whoever configured it: which services are on, and what to change if one isn't. Names of settings only, never their values."
      />
      <div className="mt-12 flex-1">
        <MissionHealth />
      </div>
    </Page>
  );
}
