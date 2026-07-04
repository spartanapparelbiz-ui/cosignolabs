import { NextResponse } from "next/server";
import { getUserId } from "./auth";
import { EngineError } from "./actions/engine";

export async function requireUser(): Promise<string> {
  const userId = await getUserId();
  if (!userId) throw new ApiError(401, "unauthorized", "Sign in required.");
  return userId;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

const ENGINE_STATUS: Record<string, number> = {
  not_found: 404,
  invalid_state: 409,
  confirmation_required: 428,
  confirmation_mismatch: 400,
  usage_limit: 402,
  forbidden: 403,
};

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json(
      { error: err.code, message: err.message },
      { status: err.status }
    );
  }
  if (err instanceof EngineError) {
    return NextResponse.json(
      { error: err.code, message: err.message },
      { status: ENGINE_STATUS[err.code] ?? 400 }
    );
  }
  const message = err instanceof Error ? err.message : "Unexpected error";
  if (message === "not_editable") {
    return NextResponse.json(
      { error: "not_editable", message: "Only proposed actions can be edited." },
      { status: 409 }
    );
  }
  if (message.startsWith("invalid_transition")) {
    return NextResponse.json(
      { error: "invalid_transition", message },
      { status: 409 }
    );
  }
  console.error("[cosigno] api error:", err);
  return NextResponse.json(
    { error: "internal", message: "Something went wrong." },
    { status: 500 }
  );
}
