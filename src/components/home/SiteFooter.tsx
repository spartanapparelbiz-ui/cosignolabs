import Link from "next/link";
import { CONTACT_EMAIL, INSTAGRAM_HANDLE, INSTAGRAM_URL } from "@/lib/brand";
import { LivingLockup } from "@/components/brand/LivingLogo";

/**
 * The footer. A plain server component — the last thing on the page has no
 * business shipping JavaScript.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-line/50 bg-cream-deep/50">
      {/* Extra bottom padding on phones: the sticky start bar lives there. */}
      <div className="mx-auto w-full max-w-6xl px-4 pb-28 pt-12 sm:pb-12">
        <div className="flex flex-wrap items-start justify-between gap-8">
          <div>
            <LivingLockup size={22} textClass="text-lg" />
            <p className="mt-3 max-w-xs text-[12px] font-semibold leading-relaxed text-ink-soft">
              give it the work. keep the final say.
            </p>
          </div>

          <nav aria-label="footer" className="flex flex-wrap gap-x-12 gap-y-6">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-ink-soft">
                product
              </p>
              <ul className="mt-3 space-y-2 text-[12px] font-bold lowercase">
                <li>
                  <Link href="/product" className="text-ink-soft hover:text-ink">
                    product
                  </Link>
                </li>
                <li>
                  <Link href="/templates" className="text-ink-soft hover:text-ink">
                    templates
                  </Link>
                </li>
                <li>
                  <Link href="/pricing" className="text-ink-soft hover:text-ink">
                    pricing
                  </Link>
                </li>
                <li>
                  <Link href="/demo" className="text-ink-soft hover:text-ink">
                    demo
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-ink-soft">
                trust
              </p>
              <ul className="mt-3 space-y-2 text-[12px] font-bold lowercase">
                <li>
                  <Link href="/security" className="text-ink-soft hover:text-ink">
                    security
                  </Link>
                </li>
                <li>
                  <Link href="/operators" className="text-ink-soft hover:text-ink">
                    operators
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className="text-ink-soft hover:text-ink">
                    privacy
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className="text-ink-soft hover:text-ink">
                    terms
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-ink-soft">
                say hello
              </p>
              <ul className="mt-3 space-y-2 text-[12px] font-bold lowercase">
                <li>
                  <a
                    href={`mailto:${CONTACT_EMAIL}`}
                    className="text-ink-soft hover:text-ink"
                  >
                    {CONTACT_EMAIL}
                  </a>
                </li>
                <li>
                  <a href={INSTAGRAM_URL} className="text-ink-soft hover:text-ink">
                    @{INSTAGRAM_HANDLE}
                  </a>
                </li>
                <li>
                  <Link href="/sign-in" className="text-ink-soft hover:text-ink">
                    sign in
                  </Link>
                </li>
              </ul>
            </div>
          </nav>
        </div>

        <p className="mt-10 text-[11px] font-semibold lowercase text-ink-soft">
          © {new Date().getFullYear()} aethric llc
        </p>
      </div>
    </footer>
  );
}
