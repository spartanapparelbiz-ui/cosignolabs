import Link from "next/link";
import { LivingLockup, LogoHome } from "@/components/brand/LivingLogo";
import { PricingLink } from "@/components/landing/Track";
import { CONTACT_EMAIL, INSTAGRAM_HANDLE, INSTAGRAM_URL } from "@/lib/brand";

/**
 * Shared shell for the public marketing pages (/product, /security,
 * /templates …): the standard header nav, a full-height column so the footer
 * sits at the bottom, and the standard footer. Pure server component — no
 * auth, no client state; these pages must render for every anonymous visitor.
 */

// "operators" describes internal architecture, not a customer decision — it
// stays reachable at /operators but is out of the primary navigation.
const NAV = [
  { href: "/product", label: "product" },
  { href: "/templates", label: "templates" },
  { href: "/security", label: "security" },
] as const;

export function MarketingShell({
  current,
  children,
}: {
  current?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen [min-height:100dvh] flex-col overflow-x-hidden">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5">
        <LogoHome size={30} textClass="text-2xl" />
        <nav className="flex items-center gap-1 sm:gap-2">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              prefetch
              aria-current={current === n.href ? "page" : undefined}
              className={`hidden rounded-btn px-3 py-2 text-sm font-bold lowercase transition-colors duration-fast hover:bg-cream-deep md:block ${
                current === n.href ? "text-ink" : "text-ink-soft"
              }`}
            >
              {n.label}
            </Link>
          ))}
          <PricingLink className="hidden rounded-btn px-3 py-2 text-sm font-bold lowercase text-ink-soft transition-colors duration-fast hover:bg-cream-deep sm:block">
            pricing
          </PricingLink>
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
            className="rounded-btn bg-signal px-4 py-2 text-sm font-extrabold text-on-signal shadow-soft transition-all duration-fast ease-brand-out hover:-translate-y-px active:scale-95"
          >
            start free
          </Link>
        </nav>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="bg-cream-deep/60">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-ink-soft">
          <LivingLockup size={20} textClass="text-base" />
          <div className="flex flex-wrap items-center gap-4 font-semibold">
            <Link href="/pricing" className="hover:text-ink">pricing</Link>
            <Link href="/privacy" className="hover:text-ink">privacy</Link>
            <Link href="/terms" className="hover:text-ink">terms</Link>
            <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-ink">{CONTACT_EMAIL}</a>
            <a href={INSTAGRAM_URL} className="hover:text-ink">@{INSTAGRAM_HANDLE}</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
