"use client";

import { useCallback, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { track } from "@/lib/analytics";

/**
 * A miniature, playable permissions board — the visitor teaches themselves
 * the tier model in ~20 seconds. Drag a chip between columns (native drag on
 * desktop) or tap a chip then tap a column (touch + keyboard). Moving "send
 * email" to Auto warns; dropping anything into Locked triggers the typed-
 * confirmation micro-demo. Pure client state, no API. Every control is a real
 * button (≥44px, focusable); nothing depends on drag alone.
 */

type Tier = "auto" | "approve" | "locked";

interface Chip {
  id: string;
  label: string;
}

const CHIPS: Chip[] = [
  { id: "search", label: "search inbox" },
  { id: "draft", label: "draft replies" },
  { id: "send_email", label: "send email" },
  { id: "post", label: "post content" },
  { id: "refund", label: "issue refund" },
];

const DEFAULTS: Record<string, Tier> = {
  search: "auto",
  draft: "auto",
  send_email: "approve",
  post: "approve",
  refund: "locked",
};

const COLUMNS: { id: Tier; title: string; sub: string }[] = [
  { id: "auto", title: "auto", sub: "runs without asking" },
  { id: "approve", title: "approve", sub: "waits for your signature" },
  { id: "locked", title: "locked", sub: "typed confirmation" },
];

function consequence(chip: Chip, to: Tier): string {
  if (to === "auto" && chip.id === "send_email")
    return "emails would now send without asking — most people keep this on Approve.";
  if (to === "auto" && chip.id === "refund")
    return "refunds would move money with no signature — most keep this Locked.";
  if (to === "auto")
    return `“${chip.label}” will now run automatically — fine for low-risk reads.`;
  if (to === "approve")
    return `“${chip.label}” will pause for your signature every time.`;
  return `“${chip.label}” is now Locked.`;
}

export default function TierBoard() {
  const [placement, setPlacement] = useState<Record<string, Tier>>(DEFAULTS);
  const [selected, setSelected] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  // typed-confirmation micro-demo: which chip is being locked
  const [lockDemo, setLockDemo] = useState<Chip | null>(null);
  const [typed, setTyped] = useState("");
  const [locked, setLocked] = useState(false);
  const dragId = useRef<string | null>(null);

  const move = useCallback(
    (chipId: string, to: Tier) => {
      const chip = CHIPS.find((c) => c.id === chipId)!;
      const from = placement[chipId];
      if (from === to) {
        setSelected(null);
        return;
      }
      setPlacement((p) => ({ ...p, [chipId]: to }));
      setSelected(null);
      track("tierboard_move", { chip: chipId, to });
      if (to === "locked") {
        // teach the typed-confirmation gate
        setLockDemo(chip);
        setTyped("");
        setLocked(false);
        setHint(null);
      } else {
        setHint(consequence(chip, to));
        setLockDemo(null);
      }
    },
    [placement]
  );

  const reset = useCallback(() => {
    setPlacement(DEFAULTS);
    setSelected(null);
    setHint(null);
    setLockDemo(null);
    track("tierboard_reset");
  }, []);

  const confirmWord = lockDemo ? lockDemo.id.replace("_", " ") : "";

  return (
    <div className="w-full max-w-3xl">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-bold text-ink-soft">
          {selected ? "now tap a column to move it" : "drag a chip — or tap one, then tap a column"}
        </p>
        <button
          onClick={reset}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-btn px-3 py-1.5 text-xs font-bold lowercase text-ink-soft ring-1 ring-inset ring-line transition-colors hover:bg-cream-deep"
        >
          <RotateCcw size={13} strokeWidth={2.5} aria-hidden="true" />
          reset
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {COLUMNS.map((col) => {
          const chips = CHIPS.filter((c) => placement[c.id] === col.id);
          const canDrop = selected && placement[selected] !== col.id;
          return (
            <div
              key={col.id}
              onDragOver={(e) => {
                if (dragId.current) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId.current) move(dragId.current, col.id);
                dragId.current = null;
              }}
              className={`flex min-h-[168px] flex-col rounded-card border p-3 transition-colors ${
                col.id === "locked" ? "tier3-texture" : ""
              } ${
                canDrop
                  ? "border-signal bg-signal/5"
                  : "border-line bg-surface/50"
              }`}
            >
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-sm font-extrabold lowercase">{col.title}</span>
                <span className="text-[10px] font-bold lowercase text-ink-soft">{col.sub}</span>
              </div>

              {/* When a chip is selected, the column becomes a labeled drop button. */}
              {canDrop && (
                <button
                  onClick={() => move(selected!, col.id)}
                  className="mb-2 min-h-[44px] rounded-btn border border-dashed border-signal bg-surface/70 px-3 text-xs font-bold lowercase text-signal transition-colors hover:bg-signal/10"
                >
                  move here
                </button>
              )}

              <div className="flex flex-col gap-2">
                {chips.map((chip) => {
                  const isSel = selected === chip.id;
                  return (
                    <button
                      key={chip.id}
                      draggable
                      onDragStart={() => {
                        dragId.current = chip.id;
                        setSelected(chip.id);
                      }}
                      onDragEnd={() => {
                        dragId.current = null;
                      }}
                      onClick={() => setSelected(isSel ? null : chip.id)}
                      aria-pressed={isSel}
                      className={`min-h-[44px] cursor-grab rounded-btn px-3 py-2 text-left text-sm font-bold transition-all active:cursor-grabbing ${
                        isSel
                          ? "bg-ink text-cream shadow-lift ring-2 ring-signal"
                          : "bg-cream-deep text-ink hover:-translate-y-px hover:shadow-soft"
                      }`}
                    >
                      {chip.label}
                    </button>
                  );
                })}
                {chips.length === 0 && (
                  <span className="px-1 py-2 text-xs text-ink-soft/60">— empty —</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* consequence hint */}
      {hint && !lockDemo && (
        <p className="mt-3 rounded-btn bg-cream-deep px-4 py-2.5 text-sm font-semibold text-ink animate-fade-through" role="status">
          {hint}
        </p>
      )}

      {/* typed-confirmation micro-demo */}
      {lockDemo && (
        <div className="mt-3 rounded-card bg-surface/70 p-4 shadow-soft ring-1 ring-inset ring-ink/10 animate-modal-in">
          {!locked ? (
            <>
              <p className="text-sm font-bold">
                locked actions need typed confirmation to ever run. try it — type{" "}
                <code className="rounded bg-cream-deep px-1.5 py-0.5 font-mono text-xs">{confirmWord}</code>{" "}
                to confirm the lock:
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  value={typed}
                  onChange={(e) => {
                    setTyped(e.target.value);
                    if (e.target.value.trim().toLowerCase() === confirmWord) {
                      setLocked(true);
                      track("tierboard_typed_confirm");
                    }
                  }}
                  placeholder={confirmWord}
                  aria-label={`type ${confirmWord} to confirm`}
                  className="min-h-[44px] flex-1 rounded-btn bg-cream-deep px-3 py-2 text-sm"
                />
              </div>
            </>
          ) : (
            <p className="text-sm font-bold text-signal">
              that&apos;s the tier-3 gate. even you have to type it — so the agent
              never can.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
