import { NextRequest, NextResponse } from "next/server";
import { runCommand } from "@/lib/agent/pipeline";
import { EngineError } from "@/lib/actions/engine";
import { PlannerError } from "@/lib/agent/provider";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import {
  enforceGlobalPlanningBudget,
  enforceLimit,
  RateLimitError,
} from "@/lib/ratelimit";
import {
  commandSchema,
  MAX_COMMAND_LENGTH,
  parseStrict,
  readJsonBody,
} from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ⚠️ TEMPORARY BLUNT DEBUG MODE (this route only).
 *
 * The generic "something went wrong on our side" was hiding the true cause of
 * /app command failures. Until the live cause is identified, this route returns
 * the REAL underlying error — status, name, message, a short stack, and a
 * runtime snapshot of which env vars the running function can actually see —
 * straight into the JSON and the on-screen toast. The ONLY thing masked is a
 * literal secret pattern (an api key / JWT accidentally embedded in an error
 * string). Revert to `errorResponse(err)` once the cause is fixed.
 */

/** Env vars this route depends on — presence only, never values. */
const WATCHED_ENV = [
  "PLANNER_API_KEY",
  "PLANNER_MODEL_DEFAULT",
  "PLANNER_MODEL_PREMIUM",
  "PLANNER_BASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
] as const;

function runtimeEnvSnapshot(): Record<string, string> {
  const snap: Record<string, string> = {};
  for (const name of WATCHED_ENV) {
    snap[name] = process.env[name] ? "present" : "MISSING-at-runtime";
  }
  return snap;
}

/** Mask literal secrets so a leaked key in an error string isn't echoed back. */
function maskSecrets(s: string): string {
  return s
    .replace(/sk-[A-Za-z0-9_-]{6,}/g, "sk-[masked]")
    .replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_.-]+/g, "[jwt-masked]");
}

function bluntErrorResponse(err: unknown): NextResponse {
  const e = err as {
    status?: number;
    code?: string;
    name?: string;
    message?: string;
    stack?: string;
  };
  const status = typeof e?.status === "number" ? e.status : 500;
  const name = e?.name || "Error";
  const rawMessage = maskSecrets(
    typeof e?.message === "string" && e.message ? e.message : String(err)
  );
  const env = runtimeEnvSnapshot();
  const plannerKeyMissing = env.PLANNER_API_KEY !== "present";

  // Lead with the single most decisive fact when the planner key isn't at
  // runtime — that's the classic Netlify "variable set but wrong scope" case.
  const lead = plannerKeyMissing
    ? "PLANNER_API_KEY is MISSING from this running function at runtime (it may exist only at build time, or its Netlify variable scope excludes Functions/Runtime). "
    : "";

  const envLine = WATCHED_ENV.map((k) => `${k}=${env[k]}`).join(", ");
  const message = `[DEBUG] ${lead}REAL ERROR — status ${status}, ${name}: ${rawMessage} :: runtime env → ${envLine}`;

  // Console logging too (in case logs are ever accessible).
  console.error(
    "[cosigno][command][DEBUG]",
    JSON.stringify({ status, name, message: rawMessage, env, stack: e?.stack })
  );

  return NextResponse.json(
    {
      error: e?.code || name,
      message,
      debug: {
        status,
        name,
        rawMessage,
        plannerKeyMissingAtRuntime: plannerKeyMissing,
        runtimeEnv: env,
        stack: (e?.stack || "").split("\n").slice(0, 8),
      },
    },
    { status }
  );
}

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
        `commands are limited to ${MAX_COMMAND_LENGTH} characters — trim it down and resend.`
      );
    }

    const body = parseStrict(commandSchema, raw, "command");
    if (!body.command.trim()) {
      throw new ApiError(400, "empty_command", "give the operator a command first.");
    }

    await enforceGlobalPlanningBudget();

    const result = await runCommand(userId, body.command.trim(), {
      sessionId: body.sessionId,
      externalContent: body.externalContent,
    });

    return NextResponse.json(result);
  } catch (err) {
    // Meaningful, typed errors keep their correct status + real message
    // (rate limit 429, usage limit 402, validation 4xx, planner 502 with the
    // real provider reason). ONLY the genuinely-unexpected error — the one that
    // was being hidden behind "something went wrong on our side" — gets the
    // blunt raw dump, so the true cause is readable on the website.
    if (
      err instanceof ApiError ||
      err instanceof RateLimitError ||
      err instanceof EngineError ||
      err instanceof PlannerError
    ) {
      return errorResponse(err);
    }
    return bluntErrorResponse(err);
  }
}
