import { NextRequest, NextResponse } from "next/server";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { getProvider } from "@/lib/integrations/registry";
import { startOAuth } from "@/lib/integrations/oauthFlow";
import { vaultConfigured } from "@/lib/integrations/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Begin connecting a third-party app: returns the provider's authorize URL for
 * the client to navigate to. A CSRF/PKCE state row is persisted first. We
 * refuse if the vault key is missing (we'd otherwise store tokens unsafely) or
 * the provider's env isn't configured.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const { key } = await params;

    if (!vaultConfigured()) {
      throw new ApiError(503, "vault_unconfigured", "connections aren't available right now.");
    }
    const provider = getProvider(key);
    if (!provider || provider.authType !== "oauth2") {
      throw new ApiError(404, "unknown_provider", "we don't recognize that app.");
    }
    if (!provider.isConfigured()) {
      throw new ApiError(400, "not_configured", `${provider.name} isn't set up on this server yet.`);
    }

    const url = await startOAuth(userId, provider);
    return NextResponse.json({ url });
  } catch (err) {
    return errorResponse(err);
  }
}
