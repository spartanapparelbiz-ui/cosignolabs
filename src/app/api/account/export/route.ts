import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { recordSecurityEvent } from "@/lib/securityEvents";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Personal data export — everything cosigno stores about the signed-in user,
 * as a single JSON download. Deliberately EXCLUDED: encrypted connection
 * credentials (secrets are never exportable, in any form) and other users'
 * data (workspace views only include what the user already sees in-product).
 * The export itself is recorded as a security event.
 */
export async function GET() {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const store = getStore();

    const [
      sessions,
      actions,
      events,
      tiers,
      usage,
      subscription,
      connections,
      automations,
      memories,
      rules,
      files,
      missions,
      objectives,
      hold,
      temporaryAuthority,
      receipts,
      securityEvents,
      audit,
      promos,
      rooms,
    ] = await Promise.all([
      store.listSessions(userId),
      store.listActions(userId, { limit: 1000 }),
      store.listEvents(userId),
      store.getTierSettings(userId),
      store.getUsage(userId),
      store.getSubscription(userId),
      store.listConnections(userId),
      store.listAutomations(userId),
      store.listMemories(userId),
      store.listPermissionRules(userId),
      store.listFiles(userId),
      store.listMissions(userId, 500),
      store.listObjectives(userId),
      store.getHold(userId),
      store.listTemporaryAuthority(userId),
      store.listReceipts(userId, 1000),
      store.listSecurityEvents(userId, 1000),
      store.listAudit(userId, 1000),
      store.listPromos(userId),
      store.listRooms(userId, 200),
    ]);

    const payload = {
      export_version: 1,
      generated_at: new Date().toISOString(),
      user_id: userId,
      sessions,
      actions,
      action_events: events,
      tier_settings: tiers,
      usage,
      subscription,
      // Credentials are stripped structurally — only safe metadata leaves.
      connections: connections.map((c) => ({
        id: c.id,
        provider_key: c.provider_key,
        kind: c.kind,
        display_name: c.display_name,
        auth_type: c.auth_type,
        scopes: c.scopes,
        status: c.status,
        created_at: c.created_at,
      })),
      automations,
      memories,
      permission_rules: rules,
      files,
      missions,
      objectives,
      hold,
      temporary_authority: temporaryAuthority,
      receipts,
      security_events: securityEvents,
      account_audit: audit,
      promotions: promos,
      cosign_rooms: rooms,
    };

    await recordSecurityEvent(userId, "data_exported", {
      detail: { actions: actions.length, receipts: receipts.length },
    });

    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": 'attachment; filename="cosigno-export.json"',
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
