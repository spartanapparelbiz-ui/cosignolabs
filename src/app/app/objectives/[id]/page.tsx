import { ObjectiveDetail } from "@/components/app/ObjectiveDetail";

export const dynamic = "force-dynamic";

export default async function ObjectiveDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <ObjectiveDetail id={id} />
    </div>
  );
}
