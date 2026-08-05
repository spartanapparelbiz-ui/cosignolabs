import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { logSecurity } from "@/lib/log";
import { appUrl } from "@/lib/stripe";
import { completeOAuth } from "@/lib/integrations/oauthFlow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * OAuth redirect target. The provider sends the browser here with ?code&state
 * (or ?error). We verify the single-use state, exchange the code for tokens,
 * store the connection (encrypted), and bounce back to the Connections screen
 * with a status flag. Errors never expose provider detail.
 */
function back(status: string, key?: string): NextResponse {
  // `key` is our own registry key (validated upstream), included so the panel
  // can celebrate the RIGHT card. Never provider-supplied text.
  const suffix = key ? `&key=${encodeURIComponent(key)}` : "";
  return NextResponse.redirect(`${appUrl()}/app/account?tab=integrations&status=${status}${suffix}`);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  // Auth is checked FIRST and outside the redirect handler: an unauthenticated
  // hit gets a clean 401 (never a silent redirect). The state row separately
  // binds the connection to the user who started the flow.
  try {
    await requireUser();
  } catch (err) {
    return errorResponse(err);
  }
  try {
    const { key } = await params;
    const url = new URL(req.url);
    const error = url.searchParams.get("error");
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    if (error) return back("denied");
    if (!code || !state) return back("invalid");

    const result = await completeOAuth({ providerKey: key, code, state });
    if (!result.ok) {
      logSecurity("invalid_input", { at: "oauth_callback", provider: key, reason: result.reason });
      return back(result.reason === "bad_state" ? "expired" : "failed");
    }
    return back("connected", key);
  } catch {
    return back("failed");
  }
}
