import { Workspace } from "@/components/Workspace";
import { TodayStrip } from "@/components/app/TodayStrip";
import { FirstRunIntro } from "@/components/FirstRunIntro";

export const dynamic = "force-dynamic";

export default function AppPage() {
  return (
    <>
      <FirstRunIntro />
      <TodayStrip />
      <Workspace />
    </>
  );
}
