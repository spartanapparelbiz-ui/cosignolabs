import type { ReactNode } from "react";

/**
 * Page furniture, so every surface in the workspace opens the same way.
 *
 * Before this existed each page picked its own width, its own padding, its own
 * heading size and its own two-sentence explanation — which is why moving
 * between them felt like moving between products rather than between rooms.
 *
 * The rule the shell enforces: a page states the one question it answers, and
 * offers at most one primary action for it.
 */

/**
 * Three widths and no others.
 *
 *   read  a single column of things to decide or read — the default
 *   work  a column with structure beside it (detail views, settings)
 *   wide  grids and tables that genuinely need the room
 *
 * Nothing is full-bleed: a line of text that runs the width of a 1440px
 * display is a line nobody finishes.
 */
type PageWidth = "read" | "work" | "wide";

const WIDTH: Record<PageWidth, string> = {
  read: "max-w-[46rem]",
  work: "max-w-[62rem]",
  wide: "max-w-[82rem]",
};

export function Page({
  children,
  width = "read",
  className = "",
}: {
  children: ReactNode;
  width?: PageWidth;
  className?: string;
}) {
  return (
    <div
      className={`mx-auto flex w-full flex-1 flex-col px-5 pb-24 pt-10 sm:px-8 sm:pt-14 lg:pt-16 ${WIDTH[width]} ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * The page's opening. One question as the title, one line of plain answer
 * underneath if — and only if — the title genuinely needs it, and room on the
 * right for the single action the page is for.
 *
 * `description` is deliberately typed as a short string. If a page needs a
 * paragraph here, the paragraph belongs in the page, not the header.
 */
export function PageHeader({
  title,
  description,
  action,
  className = "",
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header className={`flex flex-wrap items-end justify-between gap-x-6 gap-y-4 ${className}`}>
      <div className="min-w-0 max-w-[36rem]">
        <h1 className="t-display animate-fade-through">{title}</h1>
        {description && <p className="t-caption mt-2">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </header>
  );
}

/**
 * The quiet label above a group of rows. It is a caption doing a heading's
 * job, which is the point — the content is what should carry weight.
 */
export function SectionLabel({
  children,
  action,
  className = "",
}: {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between gap-4 ${className}`}>
      <h2 className="t-eyebrow">{children}</h2>
      {action}
    </div>
  );
}

/**
 * A section of the page: a label, then its content, with the vertical rhythm
 * already decided. Pages stack these; they don't hand-tune margins.
 */
export function Section({
  label,
  action,
  children,
  className = "",
}: {
  label?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`mt-14 first:mt-0 ${className}`}>
      {label && <SectionLabel action={action} className="mb-4">{label}</SectionLabel>}
      {children}
    </section>
  );
}

/**
 * Nothing here yet. An empty state says what the space is for and offers the
 * one way to fill it — it never apologizes, and it never draws a box around
 * the absence.
 */
export function EmptyState({
  title,
  description,
  action,
  illustration,
  className = "",
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  illustration?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex animate-fade-through flex-col items-center justify-center px-6 py-20 text-center ${className}`}
    >
      {illustration && <div className="mb-6 opacity-70">{illustration}</div>}
      <p className="t-title">{title}</p>
      {description && <p className="t-caption mt-2 max-w-[26rem]">{description}</p>}
      {action && <div className="mt-7">{action}</div>}
    </div>
  );
}
