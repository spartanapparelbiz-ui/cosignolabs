import { ObjectiveDetail } from "@/components/app/ObjectiveDetail";
import { Page } from "@/components/ui/Page";

export const dynamic = "force-dynamic";

export default async function ObjectiveDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Page width="work">
      <ObjectiveDetail id={id} />
    </Page>
  );
}
