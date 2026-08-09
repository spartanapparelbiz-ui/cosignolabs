import { NextRequest } from "next/server";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { enforceGlobalPlanningBudget, enforceLimit } from "@/lib/ratelimit";
import { analyzeSchema, parseStrict, readJsonBody } from "@/lib/schemas";
import { analyzeStream, loadSourcesForAnalysis } from "@/lib/agent/analyze";
import { getUserPlan } from "@/lib/billing";
import { logSecurity } from "@/lib/log";
import { getStore } from "@/lib/store";
import { usageLimitMessage } from "@/lib/enforcement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Read the attached material and stream the answer back as it is written.
 *
 * Same work as /api/analyze, same prompt, same material — the difference is
 * purely when the user sees it. A detailed report takes several seconds to
 * generate either way; buffering means all of that is spent staring at a
 * spinner, while streaming puts the first sentence on screen almost
 * immediately. That is the honest version of "faster": the total is
 * unchanged, the waiting is gone.
 *
 * Server-sent events, one JSON object per event:
 *   {"type":"meta","looked_at":[...],"could_not_read":[...],"images_seen":n}
 *   {"type":"text","text":"..."}          repeated
 *   {"type":"done"}
 *   {"type":"error","message":"..."}
 *
 * `meta` is sent FIRST, before any text, so the UI can show what was actually
 * opened — and what wasn't — before a single word of the answer appears.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser();
    await Promise.all([
      enforceLimit("commandMinute", userId),
      enforceLimit("commandDay", userId),
    ]);

    const body = parseStrict(analyzeSchema, await readJsonBody(req), "analyze");
    const question = body.question.trim();
    if (!question) {
      throw new ApiError(400, "empty_question", "ask a question about what you attached.");
    }

    const store = getStore();
    const [{ plan: userPlan, planId }, usage] = await Promise.all([
      getUserPlan(userId),
      store.getUsage(userId),
    ]);
    if (usage.actions_executed >= userPlan.actionLimit) {
      logSecurity("usage_limit_hit", { userId, at: "analyze_stream", plan: planId });
      throw new ApiError(402, "usage_limit", usageLimitMessage(planId));
    }

    await enforceGlobalPlanningBudget(userId);

    const { sources, media } = await loadSourcesForAnalysis(userId, body.sourceIds ?? []);
    if ((body.sourceIds ?? []).length > 0 && sources.length === 0) {
      throw new ApiError(404, "sources_missing", "we couldn't find those attachments — add them again.");
    }

    // Everything that can fail with a clean HTTP status has now failed. From
    // here the response is a 200 stream, so remaining errors travel as an
    // `error` event — a half-sent body cannot change its status code.
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (payload: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        };

        try {
          let wrote = false;
          const result = await analyzeStream(
            userId,
            question,
            sources,
            media,
            (chunk) => {
              wrote = true;
              send({ type: "text", text: chunk });
            },
            {
              planId,
              sessionId: body.sessionId ?? null,
              // Sent before the first word, so the UI can show what was opened
              // — and what wasn't — while the answer is still being written.
              onMeta: (meta) =>
                send({
                  type: "meta",
                  looked_at: meta.looked_at,
                  could_not_read: meta.could_not_read,
                  images_seen: meta.imagesSeen,
                }),
            }
          );

          if (!wrote && !result.answer) {
            // The model produced nothing. Say so rather than closing a silent
            // stream, which the UI cannot tell apart from a bug.
            send({
              type: "error",
              message: "the operator couldn't produce an answer — try asking it a different way.",
            });
          }
          send({ type: "done" });

          // The read is a real model call and is metered like any other.
          await store.incrementUsage(userId, usage.cycle_start).catch(() => undefined);
        } catch (err) {
          send({
            type: "error",
            message:
              err instanceof ApiError || err instanceof Error
                ? (err as { message: string }).message
                : "something went wrong reading that.",
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        // Proxies that buffer would defeat the entire point of streaming.
        "x-accel-buffering": "no",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
