import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { logSecurity } from "@/lib/log";
import { enforceLimit } from "@/lib/ratelimit";
import { parseStrict, readJsonBody } from "@/lib/schemas";
import { getStore } from "@/lib/store";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const deleteSchema = z.object({ confirmation: z.string().max(100) }).strict();

/**
 * Delete the account: cancel any Stripe subscription, then cascade-delete
 * every row owned by the user. Requires a typed confirmation ("delete") —
 * the tier-3 pattern. Irreversible; logged.
 */
export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const { confirmation } = parseStrict(deleteSchema, await readJsonBody(req), "account_delete");
    if (confirmation.trim().toLowerCase() !== "delete") {
      throw new ApiError(400, "confirmation_mismatch", 'type "delete" to confirm.');
    }

    const store = getStore();

    // Cancel the subscription first (best-effort — never blocks deletion).
    const sub = await store.getSubscription(userId);
    const stripe = getStripe();
    if (stripe && sub?.stripe_subscription_id) {
      try {
        await stripe.subscriptions.cancel(sub.stripe_subscription_id);
      } catch {
        // already canceled / not found — proceed with data deletion
      }
    }

    await store.logAudit(userId, "account_deleted", {});
    await store.deleteAllUserData(userId);
    logSecurity("account_deleted", { userId });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
