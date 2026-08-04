import { WorkspaceMap } from "@/components/app/WorkspaceMap";

export const dynamic = "force-dynamic";

export const metadata = { title: "Workspace Map" };

/** The Workspace Map — what AI works with, read left to right. */
export default function WorkspaceMapPage() {
  return <WorkspaceMap />;
}
