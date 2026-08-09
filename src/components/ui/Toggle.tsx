"use client";

import { useId } from "react";

/**
 * A switch.
 *
 * Every toggle in the product used to be hand-rolled where it was needed,
 * which meant each one had its own idea of the track width, the knob travel,
 * and — the part that actually matters — whether a screen reader could tell
 * what it was or what state it was in.
 *
 * THE WHOLE ROW IS THE CONTROL. Not a label wrapping a button: a `<label>`
 * around a `<button>` does not forward its clicks, so the "big target" that
 * shape appears to give you is a lie that only shows up when someone with
 * shaky hands tries to hit the 44×24 track. One `<button role="switch">`
 * containing everything means the target is the row, there is exactly one
 * accessible name, and the state is announced once rather than twice.
 *
 * The knob's travel is exactly the free space inside the track, so it can
 * never overflow at either end. `busy` keeps it interactive while a save is
 * in flight rather than disabling it and throwing focus to the top of the
 * document.
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
  /** The visible label, and the switch's accessible name. */
  label: string;
  description?: React.ReactNode;
  busy?: boolean;
  icon?: React.ReactNode;
}) {
  const labelId = useId();
  const descId = useId();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-busy={busy || undefined}
      aria-labelledby={labelId}
      aria-describedby={description ? descId : undefined}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-4 rounded-card bg-surface/60 p-4 text-left shadow-soft transition-[box-shadow,transform] duration-fast ease-brand-out hover:shadow-depth active:scale-[0.995]"
    >
      {icon && (
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-btn bg-cream-deep text-ink-soft"
          aria-hidden="true"
        >
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span id={labelId} className="block text-sm font-bold">
          {label}
        </span>
        {description && (
          <span id={descId} className="mt-1 block text-xs text-ink-soft">
            {description}
          </span>
        )}
      </span>
      <span
        aria-hidden="true"
        className={`inline-flex h-6 w-11 shrink-0 items-center rounded-pill p-0.5 transition-colors duration-fast ease-brand-out ${
          checked ? "bg-signal" : "bg-line"
        }`}
      >
        <span
          className={`h-5 w-5 rounded-pill bg-surface shadow-soft transition-transform duration-base ease-brand-out ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}
