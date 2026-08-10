import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * The one section header. An eyebrow label, an optional live/attention dot,
 * an optional count, and one way out to the full surface.
 *
 * It exists so the twelve sections of the workspace share a single vertical
 * rhythm. Every one of them previously set its own uppercase size, tracking,
 * margin and colour, which is why no two bands on a page lined up.
 */
export function SectionHeader({
  title,
  tone,
  count,
  href,
  hrefLabel = "view all",
  children,
}: {
  title: string;
  /** live = something is running; attention = something is waiting on you. */
  tone?: "live" | "attention";
  count?: number;
  href?: string;
  hrefLabel?: string;
  /** Extra controls rendered on the right, before the link. */
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5">
      {tone === "live" && (
        <span className="relative flex h-1.5 w-1.5 shrink-0" aria-hidden="true">
          <span className="absolute inset-0 animate-status-ping rounded-pill bg-signal" />
          <span className="relative h-1.5 w-1.5 rounded-pill bg-signal" />
        </span>
      )}
      {tone === "attention" && (
        <span className="h-1.5 w-1.5 shrink-0 rounded-pill bg-signal" aria-hidden="true" />
      )}
      <h2 className="text-eyebrow font-extrabold uppercase text-ink-soft">{title}</h2>
      {count !== undefined && count > 0 && (
        <span className="rounded-pill bg-cream-deep px-1.5 py-px text-[10px] font-extrabold tabular-nums text-ink-soft">
          {count}
        </span>
      )}
      <span className="ml-auto flex items-center gap-2">
        {children}
        {href && (
          <Link
            href={href}
            prefetch
            className="group inline-flex items-center gap-1 rounded-btn px-1.5 py-0.5 text-[11px] font-bold text-ink-soft transition-colors duration-fast hover:text-ink"
          >
            {hrefLabel}
            <ArrowRight
              size={11}
              className="transition-transform duration-fast group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </Link>
        )}
      </span>
    </div>
  );
}
