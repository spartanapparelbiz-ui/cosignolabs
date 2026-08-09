"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DrawnCheck } from "./ui";

/**
 * The phone's version of the header CTA.
 *
 * On a wide screen the nav is always on screen, so starting is never more
 * than a glance away. On a phone the nav scrolls off with everything else and
 * the page is twenty-odd screens long — so once you're past the hero, the two
 * ways forward ride along the bottom edge instead.
 *
 * It appears only after the hero (nothing competes with the opening frame),
 * only below `sm`, and it sits above the iOS home indicator rather than under
 * it. The footer reserves matching space so the bar never covers the last line
 * of the page.
 */
export function StickyCta() {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        // One viewport down: past the opening frame, into the story.
        setShown(window.scrollY > window.innerHeight * 0.9);
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
    <nav
      aria-label="start cosigno"
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-line/60 bg-cream/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-lift backdrop-blur-sm transition-transform duration-base ease-brand-out sm:hidden ${
        shown ? "translate-y-0" : "translate-y-full"
      }`}
      // Hidden from assistive tech while it's off-screen, so it isn't
      // announced or tabbed into before it exists for anyone else. `inert`
      // takes the links out of the tab order too — `aria-hidden` alone would
      // leave a focusable control a screen reader can't describe.
      aria-hidden={!shown}
      inert={!shown}
    >
      <div className="flex items-center gap-3">
        <Link
          href="/sign-up"
          prefetch
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-btn bg-signal px-5 py-3 text-sm font-extrabold lowercase text-ink shadow-soft transition-transform duration-fast ease-brand-out active:scale-95"
        >
          <DrawnCheck size={15} />
          start free
        </Link>
        <a
          href="#pricing"
          className="rounded-btn px-4 py-3 text-sm font-bold lowercase text-ink ring-1 ring-inset ring-ink transition-colors duration-fast active:bg-cream-deep"
        >
          plans
        </a>
      </div>
    </nav>
  );
}
