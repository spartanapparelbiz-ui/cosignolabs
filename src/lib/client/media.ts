"use client";

/**
 * Browser-side media preparation.
 *
 * Everything here exists so the operator gets a picture it can actually read,
 * from a device people actually use. Three jobs:
 *
 *  1. Downscale before upload. A modern phone photo is 12 MP and 5-8 MB —
 *     over the upload limit, slow on a cellular connection, and no more
 *     legible to a model than a 1568 px version. Resizing in the browser is
 *     what makes "take a photo and ask about it" feel instant instead of
 *     failing at the size check.
 *
 *  2. Sample video frames. The browser already ships a video decoder; the
 *     server does not. Decoding here means a 200 MB clip never gets uploaded,
 *     and the operator still sees real frames from it.
 *
 *  3. Capture from the camera. On a phone the OS camera is one attribute
 *     away; on a laptop it takes getUserMedia and a canvas grab.
 */

/**
 * Longest edge we send. Past roughly this size a vision model gains nothing —
 * the image is scaled down before it is read anyway — so the extra megabytes
 * only cost the user upload time.
 */
const MAX_EDGE = 1568;

/** JPEG quality for re-encoded photos. High enough to keep small text legible. */
const JPEG_QUALITY = 0.85;

/** Frames sampled from a video. Matches the operator's per-call image budget. */
export const VIDEO_FRAME_COUNT = 8;

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

export function isVideoFile(file: File): boolean {
  return file.type.startsWith("video/") || /\.(mp4|mov|m4v|webm|avi)$/i.test(file.name);
}

/** Draw a source onto a canvas at a bounded size and return a JPEG blob. */
async function toBoundedJpeg(
  source: CanvasImageSource,
  width: number,
  height: number
): Promise<Blob | null> {
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // A white base matters for transparent PNGs: JPEG has no alpha, and the
  // default is black, which turns a transparent logo into an unreadable slab.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
}

/**
 * Shrink an oversized photo before upload. Returns the ORIGINAL file when it
 * is already small enough or when anything goes wrong — a failed optimization
 * must never turn into a failed upload.
 */
export async function prepareImageForUpload(file: File): Promise<File> {
  // Small files are left exactly as they are: re-encoding a 200 KB PNG only
  // loses quality. GIFs are never re-encoded — that would flatten an
  // animation into one frame without saying so.
  if (file.size < 900_000 || file.type === "image/gif") return file;

  try {
    const bitmap = await createImageBitmap(file);
    if (Math.max(bitmap.width, bitmap.height) <= MAX_EDGE && file.size < 3_000_000) {
      bitmap.close();
      return file;
    }
    const blob = await toBoundedJpeg(bitmap, bitmap.width, bitmap.height);
    bitmap.close();
    if (!blob || blob.size >= file.size) return file;

    const base = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  }
}

export interface VideoFrames {
  frames: Blob[];
  timestamps: number[];
  duration: number;
  width: number;
  height: number;
}

/**
 * Sample evenly-spaced frames from a video, in the browser.
 *
 * Frames are taken at fractions of the duration rather than at fixed seconds,
 * so a six-second clip and a two-hour recording both come back with coverage
 * of the whole thing. The first sample is nudged off 0.0 because the very
 * first frame of a video is very often black.
 */
export async function extractVideoFrames(
  file: File,
  count: number = VIDEO_FRAME_COUNT
): Promise<VideoFrames> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  try {
    await new Promise<void>((resolve, reject) => {
      // A video the browser can't decode must fail fast and loudly — silence
      // here would look like "attached" while nothing was ever read.
      const fail = () => reject(new Error("this video couldn't be opened in your browser."));
      video.onloadedmetadata = () => resolve();
      video.onerror = fail;
      setTimeout(fail, 20_000);
    });

    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) throw new Error("this video couldn't be read.");

    const n = Math.max(1, Math.min(count, VIDEO_FRAME_COUNT));
    const targets: number[] = [];
    for (let i = 0; i < n; i++) {
      targets.push(duration > 0 ? Math.min(duration * ((i + 0.5) / n), Math.max(0, duration - 0.05)) : 0);
    }

    const frames: Blob[] = [];
    const timestamps: number[] = [];
    for (const t of targets) {
      const ok = await seekTo(video, t);
      if (!ok) continue;
      const blob = await toBoundedJpeg(video, width, height);
      if (blob) {
        frames.push(blob);
        timestamps.push(video.currentTime);
      }
    }
    if (frames.length === 0) throw new Error("no frames could be read from this video.");

    return { frames, timestamps, duration, width, height };
  } finally {
    video.src = "";
    URL.revokeObjectURL(url);
  }
}

/** Seek and wait for the frame to be painted. Resolves false if it won't. */
function seekTo(video: HTMLVideoElement, time: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      video.onseeked = null;
      resolve(ok);
    };
    video.onseeked = () => done(true);
    // A seek that never lands shouldn't hang the whole upload — skip the
    // frame and keep the ones that did work.
    setTimeout(() => done(false), 5_000);
    try {
      video.currentTime = time;
    } catch {
      done(false);
    }
  });
}

/** True when this browser can open a live camera stream (desktop capture UI). */
export function cameraSupported(): boolean {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
}

/**
 * True on a device where the OS camera app is the better experience — a phone
 * or tablet. There, `capture` on a file input opens the real camera with all
 * its focus and exposure handling, which beats any in-page preview.
 */
export function prefersNativeCamera(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
}

/** Grab a still from a live <video> preview as an upload-ready JPEG file. */
export async function captureStill(video: HTMLVideoElement): Promise<File | null> {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return null;
  const blob = await toBoundedJpeg(video, w, h);
  if (!blob) return null;
  // A stable, human name. The timestamp makes several captures in a row
  // distinguishable in the source list.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return new File([blob], `photo-${stamp}.jpg`, { type: "image/jpeg" });
}
