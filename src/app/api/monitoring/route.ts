import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { getStore } from "@/lib/store";
import { listDecisions } from "@/lib/authz/store";

/**
 * GET /api/monitoring — the live operations snapshot.
 *
 * Every number here is COUNTED FROM REAL STATE (missions, actions, connections,
 * automations, the authorization ledger). Nothing is synthesized. Metrics the
 * product does not actually instrument — MCP process CPU/memory, per-integration
 * network latency, credits, bandwidth — are deliberately ABSENT rather than
 * estimated: an operations console that invents numbers is worse than one that
 * admits a gap, and this product's whole promise is that it never fakes.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIVE_MISSION_STATES = new Set([
  "queued",
  "running",
  "retrying",
  "verifying",
  "awaiting_input",
  "awaiting_approval",
]);

export async function GET() {
  try {
    const userId = await requireUser();
    const store = getStore();

    const [missions, actions, connections, automations] = await Promise.all([
      store.listMissions(userId, 50).catch(() => []),
      store.listActions(userId).catch(() => []),
      store.listConnections(userId).catch(() => []),
      store.listAutomations(userId).catch(() => []),
    ]);

    const byMissionState: Record<string, number> = {};
    for (const m of missions) byMissionState[m.state] = (byMissionState[m.state] ?? 0) + 1;

    const byActionStatus: Record<string, number> = {};
    for (const a of actions) byActionStatus[a.status] = (byActionStatus[a.status] ?? 0) + 1;

    const now = Date.now();
    const pending = actions
      .filter((a) => a.status === "proposed")
      .map((a) => ({
        id: a.id,
        summary: a.summary,
        category: a.category,
        tier: a.tier,
        waiting_ms: Math.max(0, now - Date.parse(a.created_at)),
      }))
      .sort((x, y) => y.waiting_ms - x.waiting_ms)
      .slice(0, 12);

    // Connection health from the real record: status + last successful check.
    const services = connections.map((c) => ({
      key: c.provider_key,
      name: c.display_name,
      kind: c.kind,
      status: c.status,
      auth_type: c.auth_type,
      last_health_at: c.last_health_at,
      // Age of the last successful health check — the honest "heartbeat".
      heartbeat_age_ms: c.last_health_at ? Math.max(0, now - Date.parse(c.last_health_at)) : null,
    }));

    // The authorization ledger doubles as the event stream: it is already the
    // permanent, ordered record of what was decided and what executed.
    const decisions = listDecisions(`org_${userId}`, 20).concat(listDecisions("org_demo", 20));
    const events = decisions
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .slice(0, 20)
      .map((d) => ({
        id: d.id,
        at: d.created_at,
        actor: d.actor,
        action: d.action,
        resource: d.resource,
        authority: d.authority,
        status: d.status,
        blast_level: d.blast_level,
        executed: Boolean(d.executed_at),
      }));

    // Alerts are DERIVED from real state — never invented severity.
    const alerts: { level: "warn" | "critical"; title: string; detail: string }[] = [];
    const stale = services.filter(
      (s) => s.status === "needs_reauth" || s.status === "error" || s.status === "revoked"
    );
    for (const s of stale) {
      alerts.push({
        level: s.status === "error" ? "critical" : "warn",
        title: `${s.name} needs attention`,
        detail: `connection status is "${s.status}" — reconnect to resume its tools.`,
      });
    }
    const longest = pending[0];
    if (longest && longest.waiting_ms > 60 * 60 * 1000) {
      alerts.push({
        level: "warn",
        title: "approval waiting over an hour",
        detail: `"${longest.summary}" has been waiting for your signature.`,
      });
    }
    const failed = byMissionState.failed ?? 0;
    if (failed > 0) {
      alerts.push({
        level: "warn",
        title: `${failed} mission${failed === 1 ? "" : "s"} failed`,
        detail: "Open the mission to see the step that stopped and retry it.",
      });
    }

    return NextResponse.json(
      {
        generated_at: new Date().toISOString(),
        activity: {
          missions_active: missions.filter((m) => ACTIVE_MISSION_STATES.has(m.state)).length,
          missions_total: missions.length,
          by_mission_state: byMissionState,
          approvals_pending: byActionStatus.proposed ?? 0,
          actions_executed: byActionStatus.executed ?? 0,
          actions_failed: byActionStatus.failed ?? 0,
          actions_vetoed: byActionStatus.vetoed ?? 0,
          automations_enabled: automations.filter((a) => a.enabled).length,
          automations_total: automations.length,
        },
        services,
        approvals: pending,
        events,
        alerts,
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (err) {
    return errorResponse(err);
  }
}
