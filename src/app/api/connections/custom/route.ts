import { NextRequest, NextResponse } from "next/server";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { customConnectorSchema, parseStrict, readJsonBody } from "@/lib/schemas";
import { getStore } from "@/lib/store";
import { logSecurity } from "@/lib/log";
import { assertIntegrationCapacity } from "@/lib/enforcement";
import { encryptSecret, vaultConfigured } from "@/lib/integrations/crypto";
import { assertPublicUrl, SsrfError } from "@/lib/integrations/net/ssrf";
import { customActionRisk, RISK_TIER } from "@/lib/integrations/tiers";
import type { CapabilityRisk, CustomApiConfig } from "@/lib/integrations/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Pick the MORE restrictive of two risk classes (higher tier wins). */
function moreRestrictive(a: CapabilityRisk, b: CapabilityRisk): CapabilityRisk {
  return RISK_TIER[a] >= RISK_TIER[b] ? a : b;
}

/**
 * Add a generic API-key connector (pro+). The server owns every guardrail:
 *   - the vault must be configured (we're about to store a secret),
 *   - pro+ gate + the plan's connection limit,
 *   - the base URL is SSRF-checked (https, no private/metadata ranges) — a
 *     violation is rejected AND logged as a security event,
 *   - each action's tier is the SERVER's safe default; a user-supplied risk may
 *     only make an action MORE restrictive, never less,
 *   - the API key is encrypted at rest and never returned.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);

    if (!vaultConfigured()) {
      throw new ApiError(503, "vault_unconfigured", "connections aren't available right now.");
    }
    // Pro+ gate + connection-count limit (free = built-ins only).
    await assertIntegrationCapacity(userId, { custom: true });

    const body = parseStrict(customConnectorSchema, await readJsonBody(req), "custom_connector");

    // SSRF: reject a base URL that resolves to a private/reserved/metadata host.
    try {
      await assertPublicUrl(body.base_url);
    } catch (err) {
      if (err instanceof SsrfError) {
        logSecurity("ssrf_blocked", { userId, at: "custom_connector_add", host: safeHost(body.base_url) });
        throw new ApiError(400, "unsafe_url", "that base URL isn't allowed (must be a public https endpoint).");
      }
      throw err;
    }

    // Safe-default tiering: server risk from method+name; user may only raise it.
    const actions = body.actions.map((a) => {
      const serverRisk = customActionRisk(a.id, a.method);
      const risk = a.risk ? moreRestrictive(serverRisk, a.risk) : serverRisk;
      return { id: a.id, summary: a.summary, method: a.method, path: a.path, risk };
    });

    const config: CustomApiConfig = {
      base_url: body.base_url.replace(/\/+$/, ""),
      auth: { placement: body.auth.placement, ...(body.auth.name ? { name: body.auth.name } : {}) },
      actions,
    };

    const connection = await getStore().createConnection({
      user_id: userId,
      provider_key: "custom",
      kind: "custom",
      display_name: body.name,
      auth_type: "apikey",
      encrypted_credentials: encryptSecret({ api_key: body.api_key }),
      scopes: null,
      status: "connected",
      metadata: config as unknown as Record<string, unknown>,
    });

    await getStore().logAudit(userId, "integration_connected", { kind: "custom", name: body.name });

    // Return a secret-free view (never the api key / encrypted blob).
    const { user_id, encrypted_credentials, ...view } = connection;
    void user_id;
    void encrypted_credentials;
    return NextResponse.json({ connection: view });
  } catch (err) {
    return errorResponse(err);
  }
}

function safeHost(raw: string): string {
  try {
    return new URL(raw).host;
  } catch {
    return "invalid";
  }
}
