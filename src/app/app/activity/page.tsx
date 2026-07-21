import { ActivityLog } from "@/components/ActivityLog";

export const dynamic = "force-dynamic";

export default function ActivityPage() {
  return (
    <div className="mx-auto w-full max-w-none flex-1 px-6 lg:px-10 py-6">
      <h1 className="text-xl font-extrabold lowercase">activity</h1>
      <p className="mt-1 text-sm text-ink-soft">
        every action the operator has ever proposed, and what you did with it.
        permanent, exportable, yours.
      </p>
      <ActivityLog />
    </div>
  );
}
