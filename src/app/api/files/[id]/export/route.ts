import { NextRequest, NextResponse } from "next/server";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { idParamSchema, parseStrict } from "@/lib/schemas";
import { getStore } from "@/lib/store";
import { renderPdf } from "@/lib/files/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Download a stored document in a real file format.
 *
 * Documents are stored as text so they stay editable and versioned. The
 * binary is rendered on the way out, which means "export it as a PDF" never
 * forks the document into a stale copy — the PDF is always the current
 * version, and there is nothing to keep in sync.
 *
 * ?format=pdf   a paginated PDF
 * ?format=txt   the raw stored text
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const id = parseStrict(idParamSchema, (await params).id, "file_id");

    const file = await getStore().getFile(userId, id);
    if (!file) throw new ApiError(404, "not_found", "we couldn't find that file.");

    const format = (req.nextUrl.searchParams.get("format") ?? "pdf").toLowerCase();
    const base = file.name.replace(/\.[^.]+$/, "") || "document";

    if (format === "txt") {
      return new NextResponse(file.content, {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "content-disposition": `attachment; filename="${asciiFilename(base)}.txt"`,
        },
      });
    }

    if (format !== "pdf") {
      throw new ApiError(400, "bad_format", "choose pdf or txt.");
    }

    const pdf = renderPdf({
      title: base,
      body: file.content,
      subtitle: `cosigno · version ${file.version} · ${new Date(file.updated_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })}`,
    });

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${asciiFilename(base)}.pdf"`,
        "content-length": String(pdf.length),
        // A document can change on the next edit; a cached copy would hand
        // the user a version they already revised.
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
