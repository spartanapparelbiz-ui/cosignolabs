import { Dashboard } from "@/components/app/Dashboard";
import { FirstRunIntro } from "@/components/FirstRunIntro";

export const dynamic = "force-dynamic";

/**
 * Home — the clean dashboard. Four questions, one calm page: what to ask,
 * what's in progress, what needs approval, what's finished.
 */
export default function AppPage() {
  return (
    <>
      <FirstRunIntro />
      <Dashboard />
    </>
  );
}
