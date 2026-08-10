"use client";

import { useMemo, useState } from "react";
import type { MissionStepRecord } from "@/lib/types";
import {
  buildGraph,
  criticalPath,
  describeShape,
  readyNow,
  type GraphNode,
  type StepState,
} from "@/lib/missions/graph";
import { OPERATOR_PROFILES } from "@/lib/missions/operators";

/**
 * The plan, drawn as the graph it is.
 *
 * A numbered list flattens two completely different plans into the same
 * shape: "these three run at once" and "these three run in order" look
 * identical as 1-2-3. The graph is the only view that shows which one you
 * actually have — and therefore the only view where "why is this taking so
 * long" has a visible answer.
 *
 * Three things are drawn that a list cannot show:
 *   - **Columns are time.** A step sits at the rank of its longest dependency
 *     chain, so horizontal position is genuinely "how early this can start".
 *   - **Edges carry flow.** An edge from a finished step is solid; one whose
 *     upstream hasn't run is faint. You can see where work has actually
 *     reached.
 *   - **The critical path is highlighted.** It's the chain that sets the
 *     duration — a delay anywhere on it delays everything, and delays
 *     elsewhere are free.
 *
 * Rendered as inline SVG at a fixed viewBox and scaled by CSS, so it stays
 * crisp at any size, costs no layout work when it animates, and needs no
 * charting library.
 */

/* Geometry, in viewBox units. One node is a rounded rect on a grid. */
const NODE_W = 148;
const NODE_H = 46;
const GAP_X = 56;
const GAP_Y = 16;
const PAD = 12;

const STATE_LABEL: Record<StepState, string> = {
  ready: "queued",
  running: "running",
  verifying: "checking",
  retrying: "retrying",
  awaiting_input: "needs your answer",
  awaiting_approval: "needs approval",
  completed: "done",
  failed: "didn't complete",
  vetoed: "you stopped this",
  skipped: "skipped",
  canceled: "canceled",
};

/** Which of the four visual treatments a step gets. */
function toneOf(state: StepState): "done" | "live" | "wait" | "stop" | "idle" {
  if (state === "completed" || state === "skipped") return "done";
  if (state === "running" || state === "verifying" || state === "retrying") return "live";
  if (state === "awaiting_approval" || state === "awaiting_input") return "wait";
  if (state === "failed" || state === "vetoed" || state === "canceled") return "stop";
  return "idle";
}

const FILL: Record<string, string> = {
  done: "rgb(var(--c-surface))",
  live: "rgb(var(--c-surface))",
  wait: "rgb(var(--c-signal) / 0.10)",
  stop: "rgb(var(--c-cream-deep))",
  idle: "rgb(var(--c-cream-deep) / 0.5)",
};

const STROKE: Record<string, string> = {
  done: "rgb(var(--c-signal) / 0.55)",
  live: "rgb(var(--c-signal))",
  wait: "rgb(var(--c-signal) / 0.6)",
  stop: "rgb(var(--c-ink) / 0.35)",
  idle: "rgb(var(--c-line))",
};

export function OperatorGraph({
  steps,
  onSelect,
}: {
  steps: MissionStepRecord[];
  /** Clicking a node selects that step in the list beside the graph. */
  onSelect?: (idx: number) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const { graph, critical, ready, positions, size } = useMemo(() => {
    const g = buildGraph(steps);
    const path = new Set(criticalPath(g));
    const next = new Set(readyNow(g).map((n) => n.idx));

    // Lanes are centred per column, so a two-step column sits opposite the
    // middle of a five-step one rather than hugging the top edge.
    const perRank = new Map<number, number>();
    for (const n of g.nodes) perRank.set(n.rank, (perRank.get(n.rank) ?? 0) + 1);
    const tallest = Math.max(1, ...[...perRank.values()]);
    const height = tallest * NODE_H + (tallest - 1) * GAP_Y + PAD * 2;

    const pos = new Map<number, { x: number; y: number }>();
    for (const n of g.nodes) {
      const count = perRank.get(n.rank) ?? 1;
      const colHeight = count * NODE_H + (count - 1) * GAP_Y;
      const top = (height - colHeight) / 2;
      pos.set(n.idx, {
        x: PAD + n.rank * (NODE_W + GAP_X),
        y: top + n.lane * (NODE_H + GAP_Y),
      });
    }

    return {
      graph: g,
      critical: path,
      ready: next,
      positions: pos,
      size: {
        w: PAD * 2 + g.ranks * NODE_W + Math.max(0, g.ranks - 1) * GAP_X,
        h: height,
      },
    };
  }, [steps]);

  if (graph.nodes.length === 0) return null;

  return (
    <figure className="m-0">
      <figcaption className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-eyebrow font-extrabold uppercase text-ink-soft">the plan</span>
        <span className="text-xs font-bold">{describeShape(graph)}</span>
        {critical.size > 1 && (
          <span className="text-[11px] font-semibold text-ink-soft">
            the highlighted chain is what sets the duration
          </span>
        )}
      </figcaption>

      {/* The graph scrolls horizontally on its own rather than widening the
          page — a nine-stage plan must never make the whole workspace scroll. */}
      <div className="overflow-x-auto rounded-card bg-cream-deep/40 p-3 ring-1 ring-inset ring-line/50">
        <svg
          viewBox={`0 0 ${size.w} ${size.h}`}
          width={size.w}
          height={size.h}
          className="max-w-none"
          role="img"
          aria-label={`Plan graph: ${describeShape(graph)}`}
        >
          <defs>
            {/* The arrowhead is drawn once and referenced; two variants so a
                faint edge doesn't get a solid head. */}
            <marker id="og-head" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0 0 L8 4 L0 8 z" fill="rgb(var(--c-signal) / 0.55)" />
            </marker>
            <marker id="og-head-faint" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0 0 L8 4 L0 8 z" fill="rgb(var(--c-line))" />
            </marker>
          </defs>

          {graph.edges.map((e) => {
            const a = positions.get(e.from);
            const b = positions.get(e.to);
            if (!a || !b) return null;
            const x1 = a.x + NODE_W;
            const y1 = a.y + NODE_H / 2;
            const x2 = b.x - 6;
            const y2 = b.y + NODE_H / 2;
            const mid = (x1 + x2) / 2;
            const onCritical = critical.has(e.from) && critical.has(e.to);
            const dim = hover !== null && e.to !== hover && e.from !== hover;
            return (
              <path
                key={`${e.from}-${e.to}`}
                d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke={e.flowed ? "rgb(var(--c-signal) / 0.55)" : "rgb(var(--c-line))"}
                strokeWidth={onCritical ? 2 : 1.25}
                markerEnd={e.flowed ? "url(#og-head)" : "url(#og-head-faint)"}
                opacity={dim ? 0.25 : 1}
                className="transition-opacity duration-base"
              />
            );
          })}

          {graph.nodes.map((n, i) => {
            const p = positions.get(n.idx)!;
            const tone = toneOf(n.state);
            const isNext = ready.has(n.idx);
            const dim = hover !== null && hover !== n.idx && !n.dependsOn.includes(hover);
            return (
              // TWO nested groups, deliberately. On an SVG element a CSS
              // `transform` REPLACES the `transform` attribute rather than
              // composing with it — so putting the entrance animation on the
              // same <g> that carries translate(x y) silently collapses every
              // node onto the origin. The outer group owns position; the inner
              // one owns motion, and they never touch.
              <g
                key={n.idx}
                transform={`translate(${p.x} ${p.y})`}
                opacity={dim ? 0.35 : 1}
                className="cursor-pointer transition-opacity duration-base"
                onMouseEnter={() => setHover(n.idx)}
                onMouseLeave={() => setHover(null)}
                onClick={() => onSelect?.(n.idx)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect?.(n.idx);
                  }
                }}
                aria-label={`Step ${n.idx + 1}: ${n.purpose} — ${STATE_LABEL[n.state]}`}
              >
              <g
                className="animate-tile-in"
                style={{
                  animationDelay: `${Math.min(i * 45, 400)}ms`,
                  // Scale and translate about the node's own box, not the
                  // SVG origin — otherwise the entrance throws it across the
                  // diagram on its way in.
                  transformBox: "fill-box",
                  transformOrigin: "center",
                }}
              >
                {/* The critical-path halo sits behind the card so it reads as
                    a highlight on the chain rather than a second border. */}
                {critical.has(n.idx) && (
                  <rect
                    x={-3}
                    y={-3}
                    width={NODE_W + 6}
                    height={NODE_H + 6}
                    rx={13}
                    fill="rgb(var(--c-signal) / 0.07)"
                  />
                )}
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx={10}
                  fill={FILL[tone]}
                  stroke={STROKE[tone]}
                  strokeWidth={tone === "live" || tone === "wait" ? 1.75 : 1}
                />
                {/* The live pulse: opacity only, so it composites and never
                    reflows the diagram. */}
                {tone === "live" && (
                  <rect
                    width={NODE_W}
                    height={NODE_H}
                    rx={10}
                    fill="rgb(var(--c-signal) / 0.12)"
                    className="animate-step-live"
                    // Same rule: the pulse scales about the node's own box,
                    // not the SVG origin.
                    style={{ transformBox: "fill-box", transformOrigin: "center" }}
                  />
                )}
                <text
                  x={10}
                  y={17}
                  className="fill-ink-soft font-mono"
                  style={{ fontSize: 9, fontWeight: 700 }}
                >
                  {String(n.idx + 1).padStart(2, "0")} ·{" "}
                  {(OPERATOR_PROFILES[n.operator]?.name ?? n.operator).toLowerCase()}
                </text>
                <text
                  x={10}
                  y={31}
                  className="fill-ink"
                  style={{ fontSize: 11, fontWeight: 700 }}
                >
                  {truncate(n.purpose, 22)}
                </text>
                <text
                  x={10}
                  y={41}
                  className={tone === "wait" || tone === "live" ? "fill-signal" : "fill-ink-soft"}
                  style={{ fontSize: 8.5, fontWeight: 700 }}
                >
                  {isNext ? "ready to start" : STATE_LABEL[n.state]}
                </text>
              </g>
              </g>
            );
          })}
        </svg>
      </div>
    </figure>
  );
}

/** SVG text does not wrap, so a long purpose is clipped with an ellipsis. */
function truncate(s: string, max: number): string {
  const t = s.trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export type { GraphNode };
