import { redirect } from "next/navigation";

/**
 * An old address that asked people to understand machinery before they could
 * use it. What lives at /app/preview answers the question they actually
 * arrived with — "what happens if I turn this on?"
 */
export default function SimulationRedirect() {
  redirect("/app/preview");
}
