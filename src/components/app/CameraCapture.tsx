"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, RefreshCw, X } from "lucide-react";
import { captureStill } from "@/lib/client/media";

/**
 * Take a photo, right here.
 *
 * On a phone this component isn't used at all — a file input with `capture`
 * opens the real camera app, which focuses and exposes better than anything
 * in a web page. This is the laptop path: a live preview, one button, and the
 * photo lands straight in the ask box.
 *
 * The stream is stopped on every exit path (shot taken, cancelled, unmounted,
 * tab hidden). A camera light left on after the user thinks they're done is
 * not a small bug.
 */
export function CameraCapture({
  onCapture,
  onClose,
}: {
  onCapture: (file: File) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [facing, setFacing] = useState<"user" | "environment">("environment");

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setError(null);

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setReady(true);
      } catch (e) {
        // Say which of the three things went wrong, because the fix is
        // different for each: permission, no camera, or camera already in use.
        const name = e instanceof Error ? e.name : "";
        setError(
          name === "NotAllowedError"
            ? "your browser blocked camera access — allow it in the address bar and try again."
            : name === "NotFoundError"
              ? "no camera was found on this device."
              : name === "NotReadableError"
                ? "your camera is already in use by another app."
                : "the camera couldn't be opened."
        );
      }
    })();

    return () => {
      cancelled = true;
      stop();
    };
  }, [facing, stop]);

  // A backgrounded tab keeps the camera live otherwise.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") {
        stop();
        onClose();
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [stop, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function take() {
    if (!videoRef.current || busy) return;
    setBusy(true);
    try {
      const file = await captureStill(videoRef.current);
      if (!file) {
        setError("that shot didn't come out — try again.");
        return;
      }
      stop();
      onCapture(file);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Take a photo"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-lg flex-col gap-3 rounded-card border border-line/70 bg-surface p-4 shadow-soft"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-extrabold">Take a photo</p>
          <button onClick={onClose} aria-label="close camera" className="rounded-md p-1 text-ink-soft hover:bg-cream-deep hover:text-ink">
            <X size={16} />
          </button>
        </div>

        {error ? (
          <p className="rounded-btn bg-cream-deep px-3 py-4 text-center text-sm font-semibold text-ink">{error}</p>
        ) : (
          <div className="relative overflow-hidden rounded-btn bg-ink/90">
            <video
              ref={videoRef}
              playsInline
              muted
              className="h-auto w-full"
              // Mirroring only the front camera matches what every camera app
              // does: a selfie preview reads as a mirror, a rear shot doesn't.
              style={{ transform: facing === "user" ? "scaleX(-1)" : undefined }}
            />
            {!ready && (
              <p className="absolute inset-0 flex items-center justify-center text-sm font-bold text-cream">
                Starting camera…
              </p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
            className="inline-flex items-center gap-1.5 rounded-btn border border-line/70 px-3 py-2 text-xs font-bold text-ink-soft transition-colors hover:bg-cream-deep hover:text-ink"
          >
            <RefreshCw size={13} /> Flip
          </button>
          <button
            onClick={take}
            disabled={!ready || busy || Boolean(error)}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-btn bg-signal px-5 py-2.5 text-sm font-extrabold text-ink shadow-soft transition-transform active:scale-95 disabled:cursor-not-allowed disabled:bg-cream-deep disabled:text-ink-soft disabled:shadow-none"
          >
            <Camera size={15} /> {busy ? "Capturing…" : "Capture"}
          </button>
        </div>
      </div>
    </div>
  );
}
