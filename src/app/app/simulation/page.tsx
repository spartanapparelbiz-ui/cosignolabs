import { redirect } from "next/navigation";

/**
 * "Simulation" asked people to understand a replay engine before they could
 * use it. The page it became answers the question they actually arrived with
 * — "can I test a rule before trusting it?" — and lives under settings.
 */
export default function SimulationRedirect() {
  redirect("/app/settings/rules");
}
