import { ConnectionsPanel } from "@/components/account/ConnectionsPanel";
import { PermissionRules } from "@/components/account/PermissionRules";
import { AdaptiveDashboard } from "@/components/app/AdaptiveDashboard";
import { Page, PageHeader, Section } from "@/components/ui/Page";

export const dynamic = "force-dynamic";

export const metadata = { title: "connections" };

/** Connections — the apps cosigno can work with, and what it may do in each. */
export default function ConnectionsPage() {
  return (
    <Page width="work">
      <PageHeader
        title="What can cosigno work with?"
        description="cosigno can only touch an app after you connect it."
      />

      {/* What each connected app actually holds, and what's happening in it.
          This used to sit on home, where repository counts were the first
          thing anyone saw — it belongs with the apps themselves. */}
      <div className="mt-12">
        <AdaptiveDashboard />
      </div>

      <div className="flex-1">
        {/* The page's own title already says what this is; the panel renders
            no heading of its own. */}
        <ConnectionsPanel />
      </div>

      <Section label="Standing rules">
        <PermissionRules />
      </Section>
    </Page>
  );
}
