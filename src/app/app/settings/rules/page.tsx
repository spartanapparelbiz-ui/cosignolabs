import { SafetyRules } from "@/components/app/SafetyRules";

export const dynamic = "force-dynamic";

export const metadata = { title: "safety rules" };

/**
 * Safety rules lives under settings, not in the rail. It is the thing you do
 * once when you decide how far cosigno may go on its own — not part of a day.
 */
export default function SafetyRulesPage() {
  return <SafetyRules />;
}
