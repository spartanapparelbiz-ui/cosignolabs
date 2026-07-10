"use client";

import Link from "next/link";
import { useEffect } from "react";
import { CosignoMark } from "@/components/brand/Logo";

/**
 * Route-level error boundary — branded, calm, with a retry AND a way home.
 * The raw error is never shown to the user (only logged to the console for
 * debugging); the copy stays reassuring and blame-free.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen [min-height:100dvh] flex-col items-center justify-center gap-5 bg-cream px-6 text-center">
      <CosignoMark size={44} />
      <div>
        <h1 className="text-2xl font-extrabold lowercase text-ink">something went sideways</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">
          that&apos;s on us, not you. try again in a moment — nothing was lost.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          onClick={reset}
          className="rounded-btn bg-ink px-5 py-2 text-sm font-bold lowercase text-cream transition-transform duration-fast ease-brand-out hover:-translate-y-px"
        >
          try again
        </button>
        <Link
          href="/"
          className="rounded-btn px-5 py-2 text-sm font-bold lowercase text-ink ring-1 ring-inset ring-ink transition-transform duration-fast ease-brand-out hover:-translate-y-px"
        >
          back to home
        </Link>
      </div>
    </div>
  );
}
