import { redirect } from "next/navigation";

/**
 * "Digital twins" is gone as a concept. Everything it showed — what cosigno
 * can do per app, recent work, policies, connection health — lives on the
 * Connections page, where app management belongs. The route stays only so an
 * old bookmark lands somewhere useful.
 */
export default function TwinsRedirect() {
  redirect("/app/connections");
}
