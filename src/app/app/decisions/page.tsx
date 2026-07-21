import { redirect } from "next/navigation";

/** Renamed: the approval inbox lives at /app/approvals. Old links keep working. */
export default function DecisionsRedirect() {
  redirect("/app/approvals");
}
