"use client";

import { useMemo, useState } from "react";
import { fieldLabel, formatValue } from "@/lib/objectView";

/**
 * Editing the values of an action, without a JSON textarea.
 *
 * A person who wants to change the amount on a refund should change a field
 * called "Price", not hand-edit `{"amount_cents": 1994}` and hope the commas
 * are right. So each scalar becomes a labelled input, typed the way the value
 * is typed — a number stays a number, a flag becomes a checkbox.
 *
 * Anything that ISN'T a scalar (a nested object, a list) is shown read-only in
 * words and passed through untouched. That's the honest boundary: this editor
 * changes what it can render, and it never silently drops the rest of the
 * payload just because it couldn't draw it.
 */

type Scalar = string | number | boolean;

function isScalar(v: unknown): v is Scalar {
  return typeof v === "string" || typeof v === "number" || typeof v === "boolean";
}

/** Fields the server owns; a client edit to these is rejected anyway. */
const READ_ONLY = new Set(["kind", "connection_id", "action", "tool", "provider", "provider_key"]);

export function ValueEditor({
  payload,
  onChange,
}: {
  payload: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const [draft, setDraft] = useState<Record<string, unknown>>(payload);

  const { editable, fixed } = useMemo(() => {
    const editable: [string, Scalar][] = [];
    const fixed: [string, unknown][] = [];
    for (const [k, v] of Object.entries(draft)) {
      if (isScalar(v) && !READ_ONLY.has(k)) editable.push([k, v]);
      else fixed.push([k, v]);
    }
    return { editable, fixed };
  }, [draft]);

  function set(key: string, value: Scalar) {
    const next = { ...draft, [key]: value };
    setDraft(next);
    onChange(next);
  }

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-btn bg-cream-deep px-3 py-2.5">
      {editable.length === 0 && fixed.length === 0 && (
        <p className="text-xs text-ink-soft">This action has no values to change.</p>
      )}

      {editable.map(([key, value]) => (
        <label key={key} className="flex flex-wrap items-center gap-2 text-xs">
          <span className="w-28 shrink-0 font-bold text-ink-soft">{fieldLabel(key)}</span>
          {typeof value === "boolean" ? (
            <input
              type="checkbox"
              checked={value}
              onChange={(e) => set(key, e.target.checked)}
              className="h-4 w-4 accent-current"
            />
          ) : (
            <input
              type={typeof value === "number" ? "number" : "text"}
              value={String(value)}
              onChange={(e) =>
                set(key, typeof value === "number" ? Number(e.target.value) : e.target.value)
              }
              className="min-w-0 flex-1 rounded-btn bg-surface px-2.5 py-1.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
            />
          )}
        </label>
      ))}

      {fixed.length > 0 && (
        <div className="border-t border-line/60 pt-2">
          {fixed.map(([key, value]) => (
            <p key={key} className="flex items-baseline gap-2 text-[11px]">
              <span className="w-28 shrink-0 text-ink-soft">{fieldLabel(key)}</span>
              <span className="min-w-0 flex-1 break-words text-ink-soft">{formatValue(value, key)}</span>
            </p>
          ))}
          <p className="mt-1 text-[10px] text-ink-soft">
            These are set by the action itself and are sent unchanged.
          </p>
        </div>
      )}
    </div>
  );
}
