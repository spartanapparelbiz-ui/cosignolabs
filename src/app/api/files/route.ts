import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { fileSchema, parseStrict, readJsonBody } from "@/lib/schemas";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Mission-aware files: text deliverables the user (or an approved action) keeps. */
export async function GET() {
  try {
    const userId = await requireUser();
    const files = await getStore().listFiles(userId);
    return NextResponse.json({ files });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const body = parseStrict(fileSchema, await readJsonBody(req), "file");
    const file = await getStore().createFile({
      user_id: userId,
      session_id: body.session_id,
      name: body.name,
      mime: body.mime,
      content: body.content,
    });
    return NextResponse.json({ file });
  } catch (err) {
    return errorResponse(err);
  }
}
