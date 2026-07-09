import Link from "next/link";
import { LivingLockup, LogoHome } from "@/components/brand/LivingLogo";

/**
 * Shared shell for the legal pages (/terms, /privacy). Branded header +
 * footer on the site's tokens, a readable max-width prose column, and a
 * footer that always carries the cross-links (privacy · terms · contact) the
 * launch checklist requires. Prose styling is scoped to the column via
 * arbitrary child-variant utilities (no typography plugin), so pages just
 * pass semantic markup (h2 / p / ul / a) as children.
 */
export function LegalLayout({
  title,
  updated,
  children,
}: {
  title: string;
  /** "Last updated" date string. */
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-cream text-ink">
      <header className="border-b border-line/70">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-4 sm:px-6">
          <LogoHome size={22} textClass="text-lg" />
          <Link
            href="/"
            className="text-sm font-bold text-ink-soft transition hover:text-ink"
          >
            ← back to home
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10 sm:px-6 sm:py-14">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          {title}
        </h1>
        <p className="mt-2 text-sm font-semibold text-ink-soft">
          Last updated: {updated}
        </p>

        {/* Headings get scroll-margin so anchor jumps clear the top edge. */}
        <div
          className="mt-8 flex flex-col gap-5 text-[15px] leading-relaxed text-ink/90
            [&_h2]:mt-6 [&_h2]:scroll-mt-24 [&_h2]:text-lg [&_h2]:font-extrabold [&_h2]:tracking-tight [&_h2]:text-ink
            [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-2 [&_ul]:pl-1
            [&_a]:font-bold [&_a]:text-ink [&_a]:underline [&_a]:decoration-signal [&_a]:decoration-2 [&_a]:underline-offset-2"
        >
          {children}
        </div>
      </main>

      <LegalFooter />
    </div>
  );
}

function LegalFooter() {
  return (
    <footer className="border-t border-line/70 bg-cream-deep/60">
      <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-sm text-ink-soft sm:px-6">
        <LivingLockup size={20} textClass="text-base" />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-semibold">
          <Link href="/" className="hover:text-ink">
            home
          </Link>
          <Link href="/pricing" className="hover:text-ink">
            pricing
          </Link>
          <Link href="/privacy" className="hover:text-ink">
            privacy
          </Link>
          <Link href="/terms" className="hover:text-ink">
            terms
          </Link>
          <a href="mailto:hello@aethric.llc" className="hover:text-ink">
            hello@aethric.llc
          </a>
        </div>
      </div>
    </footer>
  );
}

/**
 * A section heading that is anchor-linkable: it renders an `id` (slug of the
 * text) and, on hover, a "#" affordance that links to itself so a specific
 * clause can be shared by URL.
 */
export function AnchorHeading({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  return (
    <h2 id={id}>
      <a href={`#${id}`} className="group !font-extrabold !text-ink !no-underline">
        {children}
        <span
          aria-hidden="true"
          className="ml-2 font-bold text-signal opacity-0 transition-opacity group-hover:opacity-100"
        >
          #
        </span>
      </a>
    </h2>
  );
}
