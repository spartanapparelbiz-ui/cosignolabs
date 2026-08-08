"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Check, X } from "lucide-react";

export interface Toast {
  id: number;
  kind: "success" | "error";
  text: string;
  /** True once the dismiss timer has fired — the toast is playing its exit. */
  leaving?: boolean;
}

const ToastContext = createContext<(kind: Toast["kind"], text: string) => void>(
  () => {}
);

export function useToast() {
  return useContext(ToastContext);
}

/** Visible time before the exit animation starts, and the exit's own length. */
const HOLD_MS = 4200;
const EXIT_MS = 220;

/**
 * Brand toasts: bottom-right, auto-dismiss, aria-live so screen readers hear
 * action results without focus theft.
 *
 * Both ends of a toast's life are animated. It arrives with `toast-in` and
 * leaves with `toast-out` rather than blinking out of existence — a result that
 * disappears between frames reads as a glitch, and this is the confirmation
 * that something real just happened. Success draws its check; an error shakes
 * once, lightly, and then holds still.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-3), { id, kind, text }]);
    // Two-stage dismissal: flag it as leaving, let the exit play, then drop it.
    timers.current.push(
      setTimeout(() => {
        setToasts((t) => t.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
        timers.current.push(
          setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), EXIT_MS)
        );
      }, HOLD_MS)
    );
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-72 flex-col gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto ${t.leaving ? "animate-toast-out" : "animate-toast-in"}`}
          >
            {/* The shake lives on an inner layer: `animation` is a shorthand,
                so an error toast that carried both classes would lose its
                entrance entirely and only twitch. */}
            <div
              className={`flex items-start gap-2.5 rounded-btn bg-ink px-4 py-3 text-sm font-semibold text-cream shadow-lift ${
                t.kind === "error" && !t.leaving ? "motion-safe:animate-shake-x" : ""
              }`}
            >
              {t.kind === "success" ? (
                <Check
                  size={16}
                  strokeWidth={2.5}
                  className="mt-0.5 shrink-0 text-signal motion-safe:animate-check-pop"
                />
              ) : (
                <X size={16} strokeWidth={2.5} className="mt-0.5 shrink-0" />
              )}
              <span>{t.text}</span>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
