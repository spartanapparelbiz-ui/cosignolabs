import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { getStore } from "@/lib/store";
import { getProvider } from "@/lib/integrations/registry";
import { discoverConnection } from "@/lib/integrations/runtime/connections";
import { capabilityRisk, serverTier } from "@/lib/integrations/tiers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/connections/[key]/discover — what this connected account actually
 * contains, and exactly what the AI may do with it. `key` is the connection id.
 *
 * Two halves, both measured:
 *
 *  · `facts` come from live read-only calls to the provider. A provider that
 *    can't be inventoried returns ok:false with a reason. Nothing is ever
 *    substituted for a number we couldn't obtain.
 *  · `capabilities` are derived from the provider's declared actions and the
 *    SERVER's tier rule — the same rule the approval engine enforces at
 *    execution. It is read from one source, so the checklist cannot drift
 *    from what actually happens when the action runs.
 *
 * POST because it makes live upstream calls; rate-limited for the same reason.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const userId = await requireUser();
    // Discovery costs several upstream calls, so it shares the transition
    // budget rather than being freely repeatable.
    await enforceLimit("transitionMinute", userId);
    const { key } = await params;

    const connection = await getStore().getConnection(userId, key);
    if (!connection) {
      return NextResponse.json(
        { ok: false, facts: [], limitations: [], error: "connection not found." },
        { status: 404 }
      );
    }

    const provider = getProvider(connection.provider_key);
    const discovery = await discoverConnection(userId, key);

    // What the AI can do, straight from the same declarations and the same
    // tier rule the engine applies. Tier 1 runs on its own; tier 2 waits for a
    // signature; tier 3 additionally needs typed confirmation.
    const capabilities = (provider?.listActions() ?? []).map((a) => {
      const tier = serverTier(a);
      return {
        id: a.id,
        summary: a.summary,
        risk: capabilityRisk(a),
        tier,
        requires:
          tier === 1 ? "runs automatically" : tier === 2 ? "your approval" : "typed confirmation",
      };
    });

    return NextResponse.json(
      {
        ...discovery,
        provider: connection.provider_key,
        provider_name: provider?.name ?? connection.display_name,
        status: connection.status,
        last_health_at: connection.last_health_at,
        capabilities,
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (err) {
    return errorResponse(err);
  }
}
