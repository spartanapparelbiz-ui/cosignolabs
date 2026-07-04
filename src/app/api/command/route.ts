import { NextRequest, NextResponse } from "next/server";
import { runCommand } from "@/lib/agent/pipeline";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { enforceGlobalPlanningBudget, enforceLimit } from "@/lib/ratelimit";
import {
  commandSchema,
  MAX_COMMAND_LENGTH,
  parseStrict,
  readJsonBody,
} from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser();

    // Cost gates run BEFORE anything touches the model:
    // per-user sliding windows, then the global daily circuit breaker.
    await enforceLimit("commandMinute", userId);
    await enforceLimit("commandDay", userId);

    const raw = await readJsonBody(req);

    // Oversized commands are rejected with 413 before validation details.
    if (
      raw &&
      typeof raw === "object" &&
      typeof (raw as Record<string, unknown>).command === "string" &&
      ((raw as Record<string, unknown>).command as string).length > MAX_COMMAND_LENGTH
    ) {
      throw new ApiError(
        413,
        "command_too_long",
        `Commands are limited to ${MAX_COMMAND_LENGTH} characters.`
      );
    }

    const body = parseStrict(commandSchema, raw, "command");
    if (!body.command.trim()) {
      throw new ApiError(400, "empty_command", "Give the operator a command.");
    }

    await enforceGlobalPlanningBudget();

    const result = await runCommand(userId, body.command.trim(), {
      sessionId: body.sessionId,
      externalContent: body.externalContent,
    });

    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
