import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * The old home of this surface, back when it lived under settings. Trying a
 * rule is an experiment, not a preference, so it moved to /app/preview — and
 * every link anyone saved still lands there.
 */
export default function RulesSettingsPage() {
  redirect("/app/preview");
}
