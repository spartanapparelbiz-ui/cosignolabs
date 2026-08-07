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
/**
 * Return to the page people actually start from.
 *
 * This sent everyone to /app/account?tab=integrations, which was the only
 * connections surface when it was written. Connections has had its own page in
 * the nav for a while, so finishing a connect dropped you on a different
 * screen than the one you left — the connection worked, and it looked like it
 * had not.
 */
function back(status: string): NextResponse {
  return NextResponse.redirect(`${appUrl()}/app/connections?status=${status}`);
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
    return back("connected");
  } catch {
    return back("failed");
  }
}
