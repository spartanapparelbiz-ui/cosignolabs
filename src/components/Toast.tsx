"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { Check, X } from "lucide-react";

export interface Toast {
  id: number;
  kind: "success" | "error";
  text: string;
}

const ToastContext = createContext<(kind: Toast["kind"], text: string) => void>(
  () => {}
);

export function useToast() {
  return useContext(ToastContext);
}

/**
 * Brand toasts: bottom-right, auto-dismiss, aria-live so screen readers
 * hear action results without focus theft.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-3), { id, kind, text }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 4200);
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
            className="pointer-events-auto flex items-start gap-2.5 rounded-btn bg-ink px-4 py-3 text-sm font-semibold text-cream shadow-lift animate-toast-in"
          >
            {t.kind === "success" ? (
              <Check size={16} strokeWidth={2.5} className="mt-0.5 shrink-0 text-signal" />
            ) : (
              <X size={16} strokeWidth={2.5} className="mt-0.5 shrink-0" />
            )}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
