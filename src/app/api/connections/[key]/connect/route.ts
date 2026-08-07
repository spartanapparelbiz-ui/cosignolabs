import { NextRequest, NextResponse } from "next/server";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { getProvider } from "@/lib/integrations/registry";
import { startOAuth } from "@/lib/integrations/oauthFlow";
import { vaultConfigured } from "@/lib/integrations/crypto";
import { assertIntegrationCapacity } from "@/lib/enforcement";

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

    /**
     * Two audiences, one throw. `message` is what a customer reads; the
     * setting names ride along in `developer` and are dropped from the
     * response outside development — see ApiError.
     */
    if (!vaultConfigured()) {
      throw new ApiError(
        503,
        "vault_unconfigured",
        "Connecting apps isn't available right now. Please try again later, or contact support.",
        ["INTEGRATIONS_ENCRYPTION_KEY"]
      );
    }
    const provider = getProvider(key);
    if (!provider || provider.authType !== "oauth2") {
      throw new ApiError(404, "unknown_provider", "We don't recognise that app.");
    }
    if (!provider.isConfigured()) {
      throw new ApiError(
        400,
        "not_configured",
        `${provider.name} sign-in isn't available right now. Please try again later, or contact support.`,
        provider.setupEnv ?? []
      );
    }
    // Plan gate BEFORE the OAuth round-trip, so a free user at their limit is
    // told to upgrade instead of finishing a flow that would be rejected.
    await assertIntegrationCapacity(userId);

    const url = await startOAuth(userId, provider);
    return NextResponse.json({ url });
  } catch (err) {
    return errorResponse(err);
  }
}
