import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { capabilityReport } from "@/lib/capabilities";
import { getStore } from "@/lib/store";
import type { ActionCategory, Tier } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "What can you do right now?" — an honest capability report from the user's
 * REAL connected apps and permission settings. It never advertises an
 * integration that isn't connected, and it's explicit about what needs the
 * user's authority.
 */
export async function GET() {
  try {
    const userId = await requireUser();
    const store = getStore();
    const [connections, tierSettings] = await Promise.all([
      store.listConnections(userId),
      store.getTierSettings(userId),
    ]);
    const connectedApps = connections
      .filter((c) => c.status === "connected")
      .map((c) => c.display_name);
    const tiers = Object.fromEntries(
      tierSettings.map((t) => [t.category, t.tier])
    ) as Partial<Record<ActionCategory, Tier>>;
    return NextResponse.json({ capabilities: capabilityReport(connectedApps, tiers) });
  } catch (err) {
    return errorResponse(err);
  }
}
