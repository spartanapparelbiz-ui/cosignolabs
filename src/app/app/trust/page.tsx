import { TrustCenter } from "@/components/trust/TrustCenter";
import { Page, PageHeader } from "@/components/ui/Page";

export const dynamic = "force-dynamic";

export const metadata = { title: "trust" };

export default function TrustPage() {
  return (
    <Page width="work">
      <PageHeader
        title="How much should cosigno do alone?"
        description="Change any of this whenever you like. It takes effect on the next thing cosigno tries."
      />
      <div className="mt-12">
        <TrustCenter />
      </div>
    </Page>
  );
}
