import Link from "next/link";
import { EmptyIllustration, type EmptyKind } from "@/components/EmptyIllustration";

/**
 * The one empty state in the product.
 *
 * Three rules, and they are the difference between a blank panel and a screen
 * that reads as finished software:
 *
 *  1. It says what IS true, not what is missing. "Everything waiting on you has
 *     been handled" and "No approvals" describe the same data; only one of them
 *     is worth reading.
 *  2. It explains what would put something here, so the reader learns the
 *     product instead of wondering whether it's broken.
 *  3. It offers exactly one obvious next action. Two competing buttons in an
 *     empty state is a choice nobody asked for.
 *
 * The illustration settles in with the copy — a single entrance, no loop, so a
 * page that lands on an empty state is calm the moment it has arrived.
 */
export function EmptyState({
  kind,
  title,
  body,
  action,
  className = "",
}: {
  kind: EmptyKind;
  title: string;
  body: string;
  /** The single next step. A link, or a button when the action is local. */
  action?: { label: string; href?: string; onClick?: () => void };
  className?: string;
}) {
  return (
    <div
      className={`flex animate-spring-in flex-col items-center gap-3 rounded-card bg-surface/40 px-6 py-14 text-center shadow-soft ${className}`}
    >
      <EmptyIllustration kind={kind} className="motion-safe:animate-float" />
      <p className="mt-1 text-[15px] font-extrabold">{title}</p>
      <p className="max-w-sm text-[13px] font-medium leading-relaxed text-ink-soft">{body}</p>
      {action && <EmptyAction {...action} />}
    </div>
  );
}

function EmptyAction({
  label,
  href,
  onClick,
}: {
  label: string;
  href?: string;
  onClick?: () => void;
}) {
  const style =
    "mt-2 inline-flex items-center gap-1.5 rounded-btn bg-signal px-5 py-2.5 text-sm font-extrabold text-ink shadow-soft transition-transform duration-fast ease-brand-out hover:-translate-y-px";
  if (href) {
    return (
      <Link href={href} prefetch className={style}>
        {label}
      </Link>
    );
  }
  return (
    <button onClick={onClick} className={style}>
      {label}
    </button>
  );
}
