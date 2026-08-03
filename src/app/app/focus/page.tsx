import { FocusMode } from "@/components/focus/FocusMode";

export const dynamic = "force-dynamic";

export const metadata = { title: "Focus" };

/**
 * Focus — where cosigno hands work to the user. Everything irrelevant is
 * gone; the actual artifact appears with cosigno's recommendation; the user
 * decides directly on the work (approve / sign / change / tell cosigno) and
 * responsibility visibly returns to cosigno.
 */
export default function FocusPage() {
  return <FocusMode />;
}
