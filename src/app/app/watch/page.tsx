import { AutomationsPanel } from "@/components/app/AutomationsPanel";
import { Page, PageHeader } from "@/components/ui/Page";

export const dynamic = "force-dynamic";

export const metadata = { title: "watch" };

/**
 * Watch — cosigno's standing eyes on your connected systems. A watch is a
 * recurring rule: monitor (notify only), prepare (propose for approval), or
 * act (an explicit per-rule grant for routine actions). Plain missions live
 * on the missions page; this page is everything that runs on its own
 * schedule — and every consequential step still stops at your signature.
 */
export default function WatchPage() {
  return (
    <Page width="work">
      <PageHeader
        title="What is cosigno watching?"
        description="Standing work that runs on a schedule. Each one watches, prepares for your approval, or — only where you allowed it — acts."
      />
      <div className="mt-12">
        <AutomationsPanel />
      </div>
    </Page>
  );
}
