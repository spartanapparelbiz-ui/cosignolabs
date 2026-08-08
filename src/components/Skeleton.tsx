import { LogoLoader } from "@/components/brand/LogoLoader";

/**
 * Loading placeholders that match the layout they stand in for.
 *
 * The rule: a skeleton has to be the shape of the thing arriving. A generic
 * grey box is only a spinner that has learned to sit still — the page still
 * jumps when the real content lands. Every page-level skeleton here mirrors its
 * page's real geometry, including the heading, so the transition from loading
 * to loaded moves nothing but the words.
 */

export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton rounded-btn ${className}`} />;
}

export function SkeletonCard() {
  return (
    <div className="rounded-card bg-surface/60 p-4 shadow-soft" aria-hidden="true">
      <div className="flex gap-2">
        <SkeletonBlock className="h-5 w-24" />
        <SkeletonBlock className="h-5 w-28" />
      </div>
      <SkeletonBlock className="mt-3 h-4 w-3/4" />
      <SkeletonBlock className="mt-2 h-4 w-1/2" />
      <div className="mt-4 flex gap-2">
        <SkeletonBlock className="h-9 w-28" />
        <SkeletonBlock className="h-9 w-20" />
      </div>
    </div>
  );
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonBlock key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page-level skeletons — one per surface, each mirroring its layout.  */
/* ------------------------------------------------------------------ */

/**
 * The heading every workspace page opens with. The title is REAL text, not a
 * grey bar: we already know what page is being opened, so printing its name
 * immediately is both more useful and more honest than a placeholder — and it
 * means the h1 never moves when the page arrives.
 */
function PageHead({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="animate-page-in font-display text-2xl font-bold lowercase">{title}</h1>
        <p className="mt-1.5 flex items-center gap-2 text-sm font-semibold text-ink-soft">
          <span className="inline-flex h-4 w-4 [transform-origin:center] motion-safe:animate-logo-breath">
            <BreathingDot />
          </span>
          {message}
        </p>
      </div>
    </div>
  );
}

/** A small orange pip standing in for the mark at text scale. */
function BreathingDot() {
  return (
    <span className="mt-[3px] inline-block h-[9px] w-[9px] rounded-pill bg-signal/70" aria-hidden="true" />
  );
}

/** Home: the greeting, the ask box, and the first band of work. */
export function DashboardSkeleton({ message }: { message: string }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-10 sm:pt-16" aria-hidden="true">
      <div className="flex flex-col items-center">
        <LogoLoader size={40} label={message} />
      </div>
      <SkeletonBlock className="mt-8 h-[58px] w-full rounded-card" />
      <div className="mt-3 flex justify-center gap-2">
        <SkeletonBlock className="h-8 w-24 rounded-pill" />
        <SkeletonBlock className="h-8 w-24 rounded-pill" />
        <SkeletonBlock className="h-8 w-28 rounded-pill" />
      </div>
      <div className="mt-8 grid gap-2 sm:grid-cols-2">
        <SkeletonBlock className="h-[52px] rounded-card" />
        <SkeletonBlock className="h-[52px] rounded-card" />
        <SkeletonBlock className="h-[52px] rounded-card" />
        <SkeletonBlock className="h-[52px] rounded-card" />
      </div>
    </div>
  );
}

/** Missions: the ask panel, the starter jobs, then the thread list. */
export function MissionsSkeleton({ message }: { message: string }) {
  return (
    <div className="mx-auto flex w-full max-w-none flex-1 flex-col px-6 py-8 lg:px-10">
      <PageHead title="delegations" message={message} />
      <SkeletonBlock className="mt-6 h-[104px] w-full rounded-card" />
      <div className="mt-3 flex flex-col gap-3" aria-hidden="true">
        <SkeletonBlock className="h-[74px] w-full rounded-card" />
        <SkeletonBlock className="h-[74px] w-full rounded-card" />
      </div>
      <SkeletonBlock className="mt-8 h-3.5 w-32" />
      <div className="mt-3 flex flex-col gap-2" aria-hidden="true">
        {[0, 1].map((i) => (
          <SkeletonBlock key={i} className="h-[62px] w-full rounded-card" />
        ))}
      </div>
    </div>
  );
}

/** Approvals: a stack of decision cards, at their real height. */
export function ApprovalsSkeleton({ message }: { message: string }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8">
      <PageHead title="approvals" message={message} />
      <div className="mt-6 flex flex-col gap-3" aria-hidden="true">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-card bg-surface p-5 shadow-depth">
            <div className="flex items-center gap-2">
              <SkeletonBlock className="h-6 w-6 rounded-pill" />
              <SkeletonBlock className="h-5 w-40" />
              <SkeletonBlock className="ml-auto h-5 w-20 rounded-pill" />
            </div>
            <SkeletonBlock className="mt-4 h-24 w-full rounded-btn" />
            <div className="mt-4 flex gap-2">
              <SkeletonBlock className="h-10 w-32 rounded-btn" />
              <SkeletonBlock className="h-10 w-24 rounded-btn" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Connections: the app grid, each row a provider card. */
export function ConnectionsSkeleton({ message }: { message: string }) {
  return (
    <div className="mx-auto flex w-full max-w-none flex-1 flex-col px-6 py-8 lg:px-10">
      <PageHead title="connections" message={message} />
      <div className="mt-6 flex flex-col gap-3" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-card bg-surface p-4 shadow-soft">
            <div className="flex items-center gap-3">
              <SkeletonBlock className="h-8 w-8 rounded-btn" />
              <SkeletonBlock className="h-5 w-32" />
              <SkeletonBlock className="ml-auto h-9 w-24 rounded-btn" />
            </div>
            <SkeletonBlock className="mt-3 h-4 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Activity: the filter row, then a timeline of events. */
export function ActivitySkeleton({ message }: { message: string }) {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <PageHead title="activity" message={message} />
      <div className="mt-6 flex gap-2" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <SkeletonBlock key={i} className="h-8 w-20 rounded-pill" />
        ))}
      </div>
      <div className="mt-5 flex flex-col gap-2.5" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-start gap-3">
            <SkeletonBlock className="mt-1 h-3 w-3 rounded-pill" />
            <div className="flex-1">
              <SkeletonBlock className="h-4 w-1/2" />
              <SkeletonBlock className="mt-1.5 h-3 w-1/4" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** A single mission's page: header, plan, and the step ladder. */
export function MissionSkeleton({ message }: { message: string }) {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <div className="flex items-center gap-2">
        <SkeletonBlock className="h-5 w-5 rounded-pill" />
        <SkeletonBlock className="h-6 w-64" />
      </div>
      <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-ink-soft">
        <span className="inline-flex [transform-origin:center] motion-safe:animate-logo-breath">
          <BreathingDot />
        </span>
        {message}
      </p>
      <SkeletonBlock className="mt-6 h-[92px] w-full rounded-card" />
      <div className="mt-4 flex flex-col gap-2" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 rounded-card bg-surface p-4 shadow-soft">
            <SkeletonBlock className="h-6 w-6 rounded-pill" />
            <SkeletonBlock className="h-4 flex-1" />
            <SkeletonBlock className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** The generic shape for a deeper surface that has no bespoke skeleton. */
export function PanelSkeleton({ title, message }: { title: string; message: string }) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-8">
      <PageHead title={title} message={message} />
      <div className="mt-6 flex flex-col gap-3" aria-hidden="true">
        <SkeletonBlock className="h-24 w-full rounded-card" />
        <SkeletonBlock className="h-24 w-full rounded-card" />
        <SkeletonBlock className="h-24 w-full rounded-card" />
      </div>
    </div>
  );
}
