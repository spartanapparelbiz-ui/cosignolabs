import { NextRequest, NextResponse } from "next/server";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { logSecurity } from "@/lib/log";
import { parseStrict, readJsonBody, sourceLinkSchema } from "@/lib/schemas";
import { getStore } from "@/lib/store";
import { readLink, validateLinkUrl } from "@/lib/sources/link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Add a link as a staged source. The URL is validated (SSRF-checked) BEFORE
 * any fetch; only then is the page actually read. The stored status reflects
 * what really happened — `ready` ONLY when the page was read. Page text is
 * untrusted; an injection flag is recorded, never acted on.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const { url } = parseStrict(sourceLinkSchema, await readJsonBody(req), "source_link");

    // Reject unsafe/invalid URLs up front — no source row is created for these.
    const valid = await validateLinkUrl(url);
    if (!valid.ok) {
      throw new ApiError(422, "bad_link", valid.reason);
    }

    const result = await readLink(valid.url.toString());
    if (result.injection) {
      logSecurity("source_injection_detected", { userId, kind: "link", domain: result.domain });
    }

    const source = await getStore().createMissionSource({
      user_id: userId,
      kind: "link",
      name: result.title,
      subtype: result.domain,
      size_bytes: 0,
      status: result.status,
      summary: result.summary,
      injection_flag: result.injection,
      detail: {
        url: result.url,
        ...result.detail,
      },
    });

    return NextResponse.json({ source });
  } catch (err) {
    return errorResponse(err);
  }
}
