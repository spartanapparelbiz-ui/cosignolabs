"use client";

/**
 * A switch.
 *
 * Every toggle in the product used to be hand-rolled where it was needed,
 * which meant each one had its own idea of the track width, the knob travel,
 * and — the part that actually matters — whether a screen reader could tell
 * what it was or what state it was in.
 *
 * The properties this one guarantees:
 *  · it is a real `role="switch"` with `aria-checked`, so it is announced as
 *    a switch and its state is spoken, not inferred from a colour
 *  · the whole row is the target, not just the 44×24 track, because a switch
 *    you have to aim at is a switch people mis-tap
 *  · the knob's travel is exactly the free space inside the track, so it can
 *    never overflow at either end
 *  · `busy` keeps it interactive while a save is in flight rather than
 *    disabling it and throwing focus to the top of the document
 */
export function Toggle({
  checked,
  onChange,
  label,
  description,
  busy = false,
  icon,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** The visible label. Also the accessible name. */
  label: string;
  description?: React.ReactNode;
  busy?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-4 rounded-card bg-surface/60 p-4 shadow-soft transition-[box-shadow] duration-fast hover:shadow-depth">
      {icon && (
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-btn bg-cream-deep text-ink-soft"
          aria-hidden="true"
        >
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">{label}</span>
        {description && (
          <span className="mt-1 block text-xs text-ink-soft">{description}</span>
        )}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-busy={busy || undefined}
        onClick={() => onChange(!checked)}
        className={`inline-flex h-6 w-11 shrink-0 items-center rounded-pill p-0.5 transition-colors duration-fast ease-brand-out ${
          checked ? "bg-signal" : "bg-line"
        }`}
      >
        <span className="sr-only">{label}</span>
        <span
          className={`h-5 w-5 rounded-pill bg-surface shadow-soft transition-transform duration-base ease-brand-out ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </label>
  );
}
