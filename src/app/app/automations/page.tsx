import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Automations grew into Watch — one page for everything on a schedule. */
export default function AutomationsPage() {
  redirect("/app/watch");
}
