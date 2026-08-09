import { NextRequest, NextResponse } from "next/server";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { getStore } from "@/lib/store";
import { validateImagePayload } from "@/lib/sources/extract";
import { MAX_VISION_IMAGES } from "@/lib/agent/provider";
import type { SourceMediaImage } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Attach a video by its frames.
 *
 * The video itself never leaves the user's machine. The browser already has a
 * video decoder, so frames are sampled there and only those frames are
 * uploaded. That is the whole design: no transcoder to run, no multi-hundred-
 * megabyte upload to survive, no size ceiling that makes a normal phone video
 * un-attachable — and the operator ends up looking at real frames rather than
 * at a filename.
 *
 * Frames arrive as image files in a multipart form (not JSON) so a handful of
 * megabytes of pixels doesn't have to fit inside the JSON body limit.
 *
 * Every frame is re-sniffed from its magic bytes here. A client saying
 * "image/jpeg" is a claim; the bytes are the proof.
 */

/** Frames are cheap to send and expensive to read — cap what one video costs. */
const MAX_FRAMES = MAX_VISION_IMAGES;

/** mm:ss for a frame caption, so the operator can cite a moment in the video. */
function timecode(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);

    const ctype = req.headers.get("content-type") ?? "";
    if (!ctype.includes("multipart/form-data")) {
      throw new ApiError(415, "bad_content_type", "send the frames as multipart/form-data.");
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new ApiError(400, "bad_form", "we couldn't read those frames.");
    }

    const rawName = (String(form.get("name") ?? "video").split(/[\\/]/).pop() ?? "video").trim();
    const name = rawName.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 200) || "video";

    const duration = Number(form.get("duration") ?? 0);
    const width = Number(form.get("width") ?? 0);
    const height = Number(form.get("height") ?? 0);
    const sizeBytes = Number(form.get("size_bytes") ?? 0);
    const declaredType = String(form.get("mime") ?? "video/mp4").slice(0, 60);

    const frameFiles = form.getAll("frames").filter((f): f is File => f instanceof File);
    if (frameFiles.length === 0) {
      throw new ApiError(400, "no_frames", "no frames could be read from that video.");
    }
    // Timestamps are parallel to the frames. A mismatch is a client bug, not
    // something to paper over with invented times — the caption falls back to
    // the frame's index instead of claiming a moment we don't know.
    const stamps = form
      .getAll("timestamps")
      .map((t) => Number(t))
      .filter((n) => Number.isFinite(n) && n >= 0);

    const media: SourceMediaImage[] = [];
    let rejected = 0;
    for (const [i, file] of frameFiles.slice(0, MAX_FRAMES).entries()) {
      const b64 = Buffer.from(await file.arrayBuffer()).toString("base64");
      const at = stamps.length === frameFiles.length ? stamps[i] : null;
      const label =
        at === null
          ? `${name} — frame ${i + 1} of ${Math.min(frameFiles.length, MAX_FRAMES)}`
          : `${name} — frame at ${timecode(at)}`;
      const checked = validateImagePayload(b64, label);
      if (!checked) {
        rejected++;
        continue;
      }
      media.push(checked.image);
    }

    if (media.length === 0) {
      throw new ApiError(422, "unreadable_frames", "those frames couldn't be read as images.");
    }

    const durationLabel = Number.isFinite(duration) && duration > 0 ? timecode(duration) : "unknown length";
    const dims = width > 0 && height > 0 ? `${width}×${height}` : "unknown size";

    const source = await getStore().createMissionSource({
      user_id: userId,
      kind: "video",
      name,
      subtype: declaredType,
      size_bytes: Number.isFinite(sizeBytes) && sizeBytes > 0 ? Math.floor(sizeBytes) : 0,
      status: "ready",
      // Honest label: the operator sees these frames, and only these frames.
      // It is never told it watched the video.
      summary: `[video: ${name} · ${durationLabel} · ${dims} · ${media.length} frame${media.length === 1 ? "" : "s"} sampled]`,
      media,
      injection_flag: false,
      detail: {
        video: true,
        readable: true,
        frames: media.length,
        duration_seconds: Number.isFinite(duration) ? Math.round(duration) : null,
        width: width || null,
        height: height || null,
        ...(rejected > 0 ? { frames_rejected: rejected } : {}),
      },
    });

    return NextResponse.json({ source });
  } catch (err) {
    return errorResponse(err);
  }
}
