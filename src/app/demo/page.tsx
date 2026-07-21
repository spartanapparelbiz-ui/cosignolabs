import type { Metadata } from "next";
import Link from "next/link";
import dynamic from "next/dynamic";
import { LivingLockup, LogoHome } from "@/components/brand/LivingLogo";

export const metadata: Metadata = {
  title: "cosigno — demo workspace",
  description:
    "the full approval loop, no account needed: command → action cards → your signature → executed. simulated tools, real model.",
  alternates: { canonical: "https://cosignolabs.com/demo" },
};

// The sandbox is the page's whole point here — still lazy so the shell paints
// instantly, with a sized placeholder (no CLS).
const LivePreview = dynamic(() => import("@/components/landing/LivePreview"), {
  loading: () => (
    <div className="mx-auto h-72 w-full max-w-2xl rounded-card bg-cream-deep" aria-hidden="true" />
  ),
});

/**
 * The PUBLIC demo dashboard — reachable by every anonymous visitor, even on a
 * deployment whose app keys aren't configured yet (it sits outside /app so no
 * middleware runs, and its only API, /api/preview, is public + mock-planner
 * only). Clearly labeled as the demo: simulated tools, state lives in the
 * browser, nothing external ever moves. Demo data can never mix with live
 * data because there is no account here at all.
 */
export default async function DemoPage({
  searchParams,
}: {
  searchParams: Promise<{ task?: string }>;
}) {
  const { task } = await searchParams;
  const initialCommand = typeof task === "string" ? task.slice(0, 200) : undefined;
  return (
    <div className="flex min-h-screen [min-height:100dvh] flex-col overflow-x-hidden">
      <header className="sticky top-0 z-10 bg-cream/90 shadow-soft backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <LogoHome size={26} textClass="text-xl" />
          <span className="rounded-pill bg-ink px-2.5 py-0.5 text-[10px] font-bold lowercase tracking-wide text-cream">
            demo workspace
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/sign-in"
              prefetch
              className="hidden rounded-btn px-3 py-2 text-sm font-bold lowercase text-ink-soft transition-colors duration-fast hover:bg-cream-deep sm:block"
            >
              sign in
            </Link>
            <Link
              href="/sign-up"
              prefetch
              className="rounded-btn bg-signal px-4 py-2 text-sm font-extrabold text-ink shadow-soft transition-all duration-fast ease-brand-out hover:-translate-y-px active:scale-95"
            >
              start free
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-8">
        <div className="mx-auto w-full max-w-2xl text-center">
          <h1 className="font-display text-2xl font-bold lowercase sm:text-3xl">
            the operator, hands on
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-sm font-semibold text-ink-soft">
            this is the real approval model running locally in your tab — type
            any command, sign what you agree with, veto what you don&apos;t.
            the tools are simulated; nothing leaves your browser session.
          </p>
        </div>

        <div className="mt-8 flex-1">
          <LivePreview initialCommand={initialCommand} />
        </div>

        <p className="mx-auto mt-8 max-w-xl text-center text-xs font-semibold text-ink-soft">
          ready to run this against your own tools?{" "}
          <Link href="/sign-up" prefetch className="font-bold underline decoration-signal underline-offset-2 hover:text-signal">
            start free
          </Link>{" "}
          — approval-first, always.
        </p>
      </main>

      <footer className="bg-cream-deep/60">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-ink-soft">
          <LivingLockup size={20} textClass="text-base" />
          <div className="flex items-center gap-4 font-semibold">
            <Link href="/pricing" className="hover:text-ink">pricing</Link>
            <Link href="/privacy" className="hover:text-ink">privacy</Link>
            <Link href="/terms" className="hover:text-ink">terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
