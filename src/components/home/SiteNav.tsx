"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LogoHome } from "@/components/brand/LivingLogo";
import { PricingLink } from "@/components/landing/Track";

const LINKS = [
  { href: "/product", label: "product" },
  { href: "/security", label: "security" },
] as const;

/**
 * The page header. It starts weightless on the cream field and only earns a
 * surface — and a hairline of shadow — once you've scrolled past the hero
 * headline, so the first thing on screen is the sentence, not the chrome.
 */
export function SiteNav() {
  const [lifted, setLifted] = useState(false);

  useEffect(() => {
    // Passive, coalesced to one read per frame: scroll handlers are the
    // easiest way to lose 60fps and the cheapest to get right.
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setLifted(window.scrollY > 24);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 transition-shadow duration-base ease-brand-out ${
        lifted ? "bg-cream shadow-soft" : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4">
        <LogoHome size={28} />
        <nav aria-label="main" className="flex items-center gap-1 sm:gap-2">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              prefetch
              className="hidden rounded-btn px-3 py-2 text-sm font-bold lowercase text-ink-soft transition-colors duration-fast hover:bg-cream-deep hover:text-ink md:block"
            >
              {l.label}
            </Link>
          ))}
          <PricingLink className="hidden rounded-btn px-3 py-2 text-sm font-bold lowercase text-ink-soft transition-colors duration-fast hover:bg-cream-deep hover:text-ink sm:block">
            pricing
          </PricingLink>
          <Link
            href="/sign-in"
            prefetch
            className="hidden rounded-btn px-3 py-2 text-sm font-bold lowercase text-ink-soft transition-colors duration-fast hover:bg-cream-deep hover:text-ink sm:block"
          >
            sign in
          </Link>
          <Link
            href="/sign-up"
            prefetch
            className="rounded-btn bg-signal px-4 py-2 text-sm font-extrabold lowercase text-ink shadow-soft transition-transform duration-fast ease-brand-out hover:-translate-y-px active:scale-95"
          >
            start free
          </Link>
        </nav>
      </div>
    </header>
  );
}
