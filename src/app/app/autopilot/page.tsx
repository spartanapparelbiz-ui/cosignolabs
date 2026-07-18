import { AutopilotView } from "@/components/autopilot/AutopilotView";

export const dynamic = "force-dynamic";

/**
 * Autopilot — the intelligence layer. One page that answers: what changed,
 * what needs attention, what's going well, and what should happen next —
 * with health, signals, a forecast, the business map, and grounded answers.
 * Every action it recommends routes through the Operator's approval door.
 */
export default function AutopilotPage() {
  return <AutopilotView />;
}
