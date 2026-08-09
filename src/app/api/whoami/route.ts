import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { isOwner } from "@/lib/owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ============================================================================
 * TEMPORARY — DELETE THIS ROUTE ONCE OWNER_IDS IS SET.
 * ============================================================================
 *
 * The owner override is keyed on the Supabase Auth user id (see lib/owner.ts),
 * and that id is not visible anywhere in the product. This route exists purely
 * so an operator can read their own id once, paste it into OWNER_IDS, and
 * confirm the override took effect. It is not part of the product surface.
 *
 * HOW TO USE IT
 *   1. Sign in to the deployment as the account you want to make an owner.
 *   2. In the same browser, open  /api/whoami
 *   3. Copy `user_id`. Repeat for each owner account you want.
 *   4. Set OWNER_IDS to the comma-separated list and redeploy.
 *   5. Reload /api/whoami — `owner` should now be true.
 *   6. Delete this file (src/app/api/whoami/route.ts) and redeploy.
 *
 * WHY IT IS SAFE WHILE IT EXISTS
 *   - requireUser() gates it exactly like every other protected route, so it
 *     503s without production keys and 401s without a session.
 *   - It returns ONLY the caller's own identity. There is no lookup by email,
 *     no listing, and no way to ask about another user — a signed-in visitor
 *     learns their own opaque id and nothing else.
 *   - It names no configuration key in its response, per the rule in
 *     lib/api.ts: a setting name tells a customer only that they are not the
 *     audience. The instructions live in this comment instead.
 *
 * It is still temporary, because a route whose only purpose is bootstrapping
 * should not outlive the bootstrap.
 */
export async function GET() {
  try {
    const userId = await requireUser();
    return NextResponse.json({
      user_id: userId,
      owner: isOwner(userId),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
