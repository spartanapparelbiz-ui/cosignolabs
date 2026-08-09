import { NextRequest, NextResponse } from "next/server";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { logSecurity } from "@/lib/log";
import { getStore } from "@/lib/store";
import { extractFile, MAX_FILE_BYTES, SUPPORTED_LABEL } from "@/lib/sources/extract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Upload a file as a staged source. The bytes are extracted ONCE here (the
 * server decides support from content, not the filename), the bounded text
 * summary is stored, and the raw bytes are discarded. The extracted text is
 * untrusted — an injection flag is recorded, never acted on.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);

    const ctype = req.headers.get("content-type") ?? "";
    if (!ctype.includes("multipart/form-data")) {
      throw new ApiError(415, "bad_content_type", "upload the file as multipart/form-data.");
    }
    // Guard the raw payload before buffering it (defense before the framework parse).
    const declared = Number(req.headers.get("content-length") || 0);
    if (declared && declared > MAX_FILE_BYTES + 64 * 1024) {
      throw new ApiError(413, "file_too_large", `files must be ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB or smaller.`);
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new ApiError(400, "bad_form", "we couldn't read that upload.");
    }
    const entry = form.get("file");
    if (!(entry instanceof File)) {
      throw new ApiError(400, "no_file", "attach a file to upload.");
    }
    if (entry.size === 0) {
      throw new ApiError(400, "empty_file", "that file is empty.");
    }
    if (entry.size > MAX_FILE_BYTES) {
      throw new ApiError(413, "file_too_large", `files must be ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB or smaller.`);
    }

    // A safe, display-only filename — never used for a filesystem path.
    const rawName = (entry.name || "file").split(/[\\/]/).pop() ?? "file";
    const safeName = rawName.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 200) || "file";
    const buf = Buffer.from(await entry.arrayBuffer());

    const result = await extractFile(buf, safeName, entry.type || "");

    if (result.injection) {
      logSecurity("source_injection_detected", { userId, kind: "file", name: safeName });
    }

    const source = await getStore().createMissionSource({
      user_id: userId,
      kind: "file",
      name: safeName,
      subtype: result.mime,
      size_bytes: entry.size,
      status: result.status === "ready" ? "ready" : result.status === "unsupported" ? "unsupported" : "failed",
      summary: result.summary,
      // The pixels themselves, for anything meant to be looked at. Without
      // this an image reaches the operator as a filename, and a filename is
      // all it can then describe.
      media: result.images,
      injection_flag: result.injection,
      detail: {
        ...result.detail,
        // A human message the UI shows verbatim on the chip.
        ...(result.status === "unsupported"
          ? { message: `cosigno can read ${SUPPORTED_LABEL}. This file type isn't supported.` }
          : {}),
      },
    });

    return NextResponse.json({ source });
  } catch (err) {
    return errorResponse(err);
  }
}
