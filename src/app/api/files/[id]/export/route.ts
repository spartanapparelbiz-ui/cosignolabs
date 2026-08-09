import { NextRequest, NextResponse } from "next/server";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { idParamSchema, parseStrict } from "@/lib/schemas";
import { getStore } from "@/lib/store";
import { FORMAT_LABEL, formatOf, render } from "@/lib/files/formats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Download a stored document in any format cosigno can produce.
 *
 * Documents are stored as text and the binary is rendered on the way out.
 * That means "give me that as a Word file" never forks the document into a
 * stale copy — every export is of the current version, so the file someone
 * downloads and the document they keep editing cannot disagree.
 *
 * ?format=pdf|docx|xlsx|pptx|csv|md|txt|html|json
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const id = parseStrict(idParamSchema, (await params).id, "file_id");

    const file = await getStore().getFile(userId, id);
    if (!file) throw new ApiError(404, "not_found", "we couldn't find that file.");

    const requested = (req.nextUrl.searchParams.get("format") ?? "pdf").toLowerCase();
    const format = formatOf(requested);
    if (!format) {
      throw new ApiError(400, "bad_format", `cosigno can produce ${FORMAT_LABEL}.`);
    }

    const base = file.name.replace(/\.[^.]+$/, "") || "document";
    const bytes = render(format.id, {
      title: base,
      body: file.content,
      subtitle: `cosigno · version ${file.version} · ${new Date(file.updated_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })}`,
    });

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "content-type": format.binary ? format.mime : `${format.mime}; charset=utf-8`,
        "content-disposition": `attachment; filename="${asciiFilename(base)}${format.extension}"`,
        "content-length": String(bytes.length),
        // A document changes on the next edit; a cached copy would hand the
        // user a version they already revised.
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * A filename safe for the Content-Disposition header. Quotes and non-ASCII
 * break the header parse in some clients and can be used to smuggle extra
 * header directives, so both are stripped rather than escaped.
 */
function asciiFilename(name: string): string {
  const clean = name
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/["\\\r\n;]/g, "")
    .trim()
    .slice(0, 80);
  return clean || "document";
}
