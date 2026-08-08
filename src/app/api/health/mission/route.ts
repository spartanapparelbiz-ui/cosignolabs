import { NextResponse } from "next/server";
import { developerDetail, errorResponse, requireUser } from "@/lib/api";
import { getStore, supabaseConfigured } from "@/lib/store";
import { browserProviderConfigured, isLiveBrowser } from "@/lib/browser";
import { plannerConfigured } from "@/lib/agent/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Deployment health for the durable mission engine. Its whole point is to make
 * silent misconfiguration impossible: if the mission cron isn't running, this
 * says so plainly, so no user is promised background execution that isn't
 * wired. Auth-gated (it reflects the caller's own runnable missions) and
 * secret-free.
 */
export async function GET() {
  try {
    const userId = await requireUser();
    const store = getStore();
    const cronConfigured = Boolean(process.env.CRON_SECRET?.trim());
    const runnable = await store.listRunnableMissions(50);
    const mine = runnable.filter((m) => m.user_id === userId);

    return NextResponse.json({
      mission_cron_configured: cronConfigured,
      automation_cron_configured: cronConfigured,
      background_execution_active: cronConfigured,
      missions_waiting_for_tick: mine.length,
      database: supabaseConfigured() ? "supabase" : "in-memory (dev)",
      planner_configured: plannerConfigured(),
      browser_provider_configured: browserProviderConfigured(),
      browser_live: isLiveBrowser(),
      /**
       * The status is for anyone; the setting name is for whoever can change
       * it. This endpoint is reachable by any signed-in user, so the name is
       * disclosed the same way every other one is — development builds only.
       */
      note: cronConfigured
        ? "Background running is switched on for this workspace."
        : "Background running isn't available for this workspace yet — work advances while its page is open, and scheduled orders don't fire on their own.",
      ...developerDetail(cronConfigured ? [] : ["CRON_SECRET"]),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
