import Link from "next/link";
import { LivingLockup, LogoHome } from "@/components/brand/LivingLogo";
import { PricingLink } from "@/components/landing/Track";

/**
 * Shared shell for the public marketing pages (/product, /security,
 * /templates …): the standard header nav, a full-height column so the footer
 * sits at the bottom, and the standard footer. Pure server component — no
 * auth, no client state; these pages must render for every anonymous visitor.
 */

const NAV = [
  { href: "/product", label: "product" },
  { href: "/operators", label: "capabilities" },
  { href: "/templates", label: "use cases" },
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
            className="rounded-btn bg-signal px-4 py-2 text-sm font-extrabold text-ink shadow-soft transition-all duration-fast ease-brand-out hover:-translate-y-px active:scale-95"
          >
            try cosigno
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
            <a href="mailto:hello@aethric.llc" className="hover:text-ink">hello@aethric.llc</a>
            <a href="https://instagram.com/aethric.hq" className="hover:text-ink">@aethric.hq</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
