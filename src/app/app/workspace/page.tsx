import { Workspace } from "@/components/Workspace";
import { TodayStrip } from "@/components/app/TodayStrip";

export const dynamic = "force-dynamic";

export const metadata = { title: "workspace" };

/**
 * The command workspace — type a command, review the proposed action cards,
 * approve each one. Kept as a focused power-user surface; the home dashboard
 * is the everyday entry point.
 */
export default function WorkspacePage() {
  return (
    <>
      <TodayStrip />
      <Workspace />
    </>
  );
}
