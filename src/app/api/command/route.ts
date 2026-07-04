import { NextRequest, NextResponse } from "next/server";
import { runCommand } from "@/lib/agent/pipeline";
import { ApiError, errorResponse, requireUser } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser();
    const body = await req.json().catch(() => ({}));
    const command = typeof body.command === "string" ? body.command.trim() : "";
    if (!command) {
      throw new ApiError(400, "empty_command", "Give the operator a command.");
    }
    if (command.length > 4000) {
      throw new ApiError(400, "command_too_long", "Commands are limited to 4000 characters.");
    }

    const externalContent = Array.isArray(body.externalContent)
      ? body.externalContent
          .filter(
            (c: unknown): c is { source: string; content: string } =>
              !!c &&
              typeof (c as Record<string, unknown>).source === "string" &&
              typeof (c as Record<string, unknown>).content === "string"
          )
          .slice(0, 10)
      : [];

    const result = await runCommand(userId, command, {
      sessionId: typeof body.sessionId === "string" ? body.sessionId : undefined,
      externalContent,
    });

    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
