import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Founding beta application — the only unauthenticated write in the app. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const name = clean(body.name, 120);
    const email = clean(body.email, 200);
    const tools = clean(body.tools, 500);
    const workflow = clean(body.workflow, 1000);

    if (!name || !email || !tools || !workflow) {
      return NextResponse.json(
        { error: "missing_fields", message: "All four fields are required." },
        { status: 400 }
      );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "bad_email", message: "That email doesn't look right." },
        { status: 400 }
      );
    }

    await getStore().createBetaApplication({ name, email, tools, workflow });
    return NextResponse.json({
      ok: true,
      message:
        "Application received. We review applications weekly and onboard in small cohorts — you'll hear from us at " +
        email +
        ".",
    });
  } catch (err) {
    return errorResponse(err);
  }
}

function clean(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
