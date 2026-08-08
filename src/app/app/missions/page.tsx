import { MissionList } from "@/components/app/MissionList";
import { MissionRunner } from "@/components/app/MissionRunner";
import { getUserId } from "@/lib/auth";
import { servingAllowed } from "@/lib/env";
import { getStore } from "@/lib/store";
import type { MissionRecord } from "@/lib/types";
import { Page, PageHeader, Section } from "@/components/ui/Page";

export const dynamic = "force-dynamic";

export const metadata = { title: "missions" };

/**
 * Missions — every outcome handed to cosigno, and what each one is doing right
 * now. The list is loaded server-side so it's on screen at first paint;
 * MissionRunner then revalidates client-side (prefetch failures fall back to
 * the client loader unchanged).
 *
 * The page used to call these "delegations" while the navigation called them
 * "missions". One thing, one name.
 */
export default async function MissionsPage() {
  let initial: MissionRecord[] | undefined;
  try {
    if (servingAllowed()) {
      const userId = await getUserId();
      if (userId) {
        initial = await getStore().listMissions(userId, 25);
      }
    }
  } catch {
    // fall through — MissionRunner fetches client-side exactly as before
  }
  return (
    <Page width="work">
      {/* No action in the header: the composer below starts a mission, and a
          second button that navigates elsewhere to do the same job is the kind
          of duplicate that makes a product feel assembled rather than made. */}
      <PageHeader
        title="What is cosigno working on?"
        description="Every outcome you've handed over, with what actually ran and what still needs you."
      />
      <div className="mt-12">
        <MissionRunner initial={initial} />
      </div>
      <Section label="Threads">
        <MissionList />
      </Section>
    </Page>
  );
}
