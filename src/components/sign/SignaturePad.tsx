"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

/**
 * The signature surface — a pointer-drawn ink canvas that works with mouse,
 * trackpad, touch, and stylus (one pointer-events code path covers all
 * four). Strokes render as smoothed quadratic segments with light
 * velocity-based width, so the ink follows the hand naturally instead of
 * looking like polyline scribble. Devicepixel-scaled for crisp export.
 */

export interface SignaturePadHandle {
  clear(): void;
  isEmpty(): boolean;
  /** Small PNG data URI of the drawing (transparent background). */
  toDataUrl(): string;
}

interface Point {
  x: number;
  y: number;
  t: number;
}

const INK = "#141414";

export const SignaturePad = forwardRef<
  SignaturePadHandle,
  { height?: number; onInk?: () => void }
>(function SignaturePad({ height = 160, onInk }, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<Point | null>(null);
  const lastWidth = useRef(2.2);
  const [empty, setEmpty] = useState(true);

  const ctxOf = useCallback(() => canvasRef.current?.getContext("2d") ?? null, []);

  // Match the backing store to CSS pixels × devicePixelRatio once mounted.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * scale);
    canvas.height = Math.round(rect.height * scale);
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(scale, scale);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = INK;
    }
  }, []);

  const pointFrom = useCallback((e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top, t: e.timeStamp };
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.setPointerCapture(e.pointerId);
      drawing.current = true;
      last.current = pointFrom(e);
      lastWidth.current = 2.2;
      // A dot for taps — a signature can contain dotted i's.
      const ctx = ctxOf();
      if (ctx && last.current) {
        ctx.beginPath();
        ctx.fillStyle = INK;
        ctx.arc(last.current.x, last.current.y, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
      if (empty) {
        setEmpty(false);
        onInk?.();
      }
    },
    [ctxOf, empty, onInk, pointFrom]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drawing.current || !last.current) return;
      const ctx = ctxOf();
      if (!ctx) return;
      const p = pointFrom(e);
      const prev = last.current;
      const dist = Math.hypot(p.x - prev.x, p.y - prev.y);
      if (dist < 1.5) return;
      // Faster strokes thin the line slightly — natural ink feel, smoothed
      // so width never jumps between segments.
      const speed = dist / Math.max(1, p.t - prev.t);
      const target = Math.max(1.1, Math.min(2.8, 2.9 - speed * 1.1));
      const width = lastWidth.current * 0.75 + target * 0.25;
      lastWidth.current = width;
      const midX = (prev.x + p.x) / 2;
      const midY = (prev.y + p.y) / 2;
      ctx.beginPath();
      ctx.lineWidth = width;
      ctx.moveTo(prev.x, prev.y);
      ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last.current = p;
    },
    [ctxOf, pointFrom]
  );

  const onPointerUp = useCallback(() => {
    drawing.current = false;
    last.current = null;
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      clear() {
        const canvas = canvasRef.current;
        const ctx = ctxOf();
        if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        setEmpty(true);
      },
      isEmpty: () => empty,
      toDataUrl: () => canvasRef.current?.toDataURL("image/png") ?? "",
    }),
    [ctxOf, empty]
  );

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        style={{ height, touchAction: "none" }}
        className="w-full cursor-crosshair rounded-btn bg-cream shadow-well"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        aria-label="draw your signature"
      />
      {/* The signing baseline. */}
      <div
        className="pointer-events-none absolute inset-x-6 bottom-8 border-b border-ink/25"
        aria-hidden="true"
      />
      {empty && (
        <p className="pointer-events-none absolute inset-x-0 bottom-10 text-center text-sm font-semibold text-ink-soft/60">
          sign here
        </p>
      )}
    </div>
  );
});
