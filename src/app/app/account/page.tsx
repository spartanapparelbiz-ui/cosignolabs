import { AccountCenter } from "@/components/account/AccountCenter";
import { Page, PageHeader } from "@/components/ui/Page";

export const dynamic = "force-dynamic";

export const metadata = { title: "account" };

export default function AccountPage() {
  return (
    <Page width="wide">
      <PageHeader
        title="What controls your workspace?"
        description="Your profile, what cosigno may do, your plan, and everything it has touched."
      />
      <AccountCenter />
    </Page>
  );
}
