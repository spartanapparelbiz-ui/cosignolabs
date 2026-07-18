import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { parseStrict, readJsonBody, savedSignatureSchema } from "@/lib/schemas";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The user's saved signature (Hold to Sign). Stored once, replayed onto
 * future authorization cards on an explicit hold. It is a product
 * interaction representing approval inside cosigno — not automatically a
 * legally binding e-signature; the hashed authorization record on each
 * approval event remains the proof.
 */
export async function GET() {
  try {
    const userId = await requireUser();
    const signature = await getStore().getSignature(userId);
    // Never leak another layer's shape — name + image + timestamps only.
    return NextResponse.json({ signature });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const body = parseStrict(savedSignatureSchema, await readJsonBody(req), "signature");
    const signature = await getStore().saveSignature(userId, body.name, body.image);
    return NextResponse.json({ signature });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE() {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    await getStore().deleteSignature(userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
