import { Workspace } from "@/components/Workspace";
import { TodayStrip } from "@/components/app/TodayStrip";

export const dynamic = "force-dynamic";

export default function AppPage() {
  return (
    <>
      <TodayStrip />
      <Workspace />
    </>
  );
}
