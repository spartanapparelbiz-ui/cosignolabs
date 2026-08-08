import { AccountCenter } from "@/components/account/AccountCenter";
import { Page, PageHeader } from "@/components/ui/Page";

export const dynamic = "force-dynamic";

export const metadata = { title: "plan" };

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  return (
    <Page width="wide">
      <PageHeader title="Your plan" description="What you're on, what you've used, and your billing." />
      {status === "success" && (
        <p className="t-body mt-8 animate-fade-through border-l-2 border-positive pl-3.5">
          You&apos;re all set — your plan is active. It may take a moment to show here.
        </p>
      )}
      <AccountCenter initialTab="usage" />
    </Page>
  );
}
