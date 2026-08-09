import Link from "next/link";
import { CosignoMark } from "@/components/brand/Logo";

/** Branded 404 — calm, on-brand, always a way back. */
export default function NotFound() {
  return (
    <div className="flex min-h-screen [min-height:100dvh] flex-col items-center justify-center gap-5 bg-cream px-6 text-center">
      <CosignoMark size={44} />
      <div>
        <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-ink-soft">404</p>
        <h1 className="mt-1.5 text-2xl font-extrabold lowercase text-ink">that page isn&apos;t here</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">
          the link may be old or mistyped. nothing is broken. let&apos;s get you back.
        </p>
      </div>
      <Link
        href="/"
        className="rounded-btn bg-ink px-5 py-2 text-sm font-bold lowercase text-cream transition-transform duration-fast ease-brand-out hover:-translate-y-px"
      >
        back to home
      </Link>
    </div>
  );
}
