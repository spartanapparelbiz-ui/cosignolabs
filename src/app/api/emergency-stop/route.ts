import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { getStore } from "@/lib/store";
import { logSecurity } from "@/lib/log";

/**
 * POST /api/emergency-stop — one control that halts everything.
 *
 * Ordering is deliberate and is the whole safety argument:
 *
 *   1. HOLD FIRST. `scope: "all"` is set before anything else, so from the
 *      first millisecond the engine refuses every new execution (holdBlocks
 *      returns true for all tiers). Nothing new can start while we clean up.
 *   2. THEN revoke temporary authority. Standing grants that lower a tier are
 *      the one thing that could let work through after a resume, so they are
 *      withdrawn rather than left to expire.
 *   3. THEN record it. The audit entry is written last so it reports what
 *      actually happened, not what we intended.
 *
 * State is PRESERVED, never destroyed. In-flight missions are blocked at the
 * boundary and keep their step rows, leases, and receipts — resuming continues
 * from where it stopped. An emergency stop that discarded work would make
 * operators hesitate to use it, which is the opposite of what a stop is for.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const userId = await requireUser();
    const store = getStore();
    const startedAt = Date.now();

    // 1. Hold everything, immediately.
    const hold = await store.setHold(userId, "all");

    // 2. Withdraw every live temporary-authority grant.
    const grants = await store.listTemporaryAuthority(userId).catch(() => []);
    const live = grants.filter(
      (g) => g.revoked_at === null && Date.parse(g.expires_at) > Date.now()
    );
    const revoked = await Promise.all(
      live.map((g) =>
        store
          .revokeTemporaryAuthority(userId, g.id)
          .then(() => String(g.category))
          .catch(() => null)
      )
    );
    const revokedCategories = revoked.filter(Boolean) as string[];

    // 3. Record it — audit trail plus the security log administrators watch.
    const detail = {
      scope: hold.scope,
      revoked_grants: revokedCategories.length,
      categories: revokedCategories,
      ms: Date.now() - startedAt,
    };
    await store.logAudit(userId, "emergency_stop", detail).catch(() => {});
    logSecurity("emergency_stop", { userId, ...detail });

    return NextResponse.json(
      {
        stopped: true,
        scope: hold.scope,
        revoked_grants: revokedCategories.length,
        revoked_categories: revokedCategories,
        took_ms: Date.now() - startedAt,
        // Said plainly so the operator knows nothing was thrown away.
        state: "preserved — in-flight work is paused at the boundary and resumes where it stopped",
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (err) {
    return errorResponse(err);
  }
}

/** DELETE — lift the stop. Deliberately separate from the stop itself. */
export async function DELETE() {
  try {
    const userId = await requireUser();
    const store = getStore();
    const hold = await store.setHold(userId, "none");
    await store.logAudit(userId, "emergency_stop_lifted", { scope: hold.scope }).catch(() => {});
    logSecurity("emergency_stop_lifted", { userId });
    return NextResponse.json(
      { stopped: false, scope: hold.scope },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (err) {
    return errorResponse(err);
  }
}
