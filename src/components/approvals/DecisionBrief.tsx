"use client";

import {
  Clock,
  Gauge,
  Layers,
  RotateCcw,
  ShieldQuestion,
  TriangleAlert,
} from "lucide-react";
import type { ApprovalBrief } from "@/lib/approvals/brief";
import { ConnectorLogo } from "@/components/integrations/ConnectorLogo";

/**
 * The decision brief, as it appears on a card.
 *
 * Six facts in a fixed order, so the fifth approval of the day is read in the
 * same places as the first: why you're being asked, what it touches, what it
 * would cost to be wrong, whether it can be taken back, how sure cosigno is
 * that the proposal is complete, and how long it runs.
 *
 * One typographic rule does most of the work here: **the irreversible line is
 * the only one allowed to be loud.** Rollback prints in full ink weight when
 * the answer is no, and drops to the muted secondary when the answer is yes.
 * Everything else on the brief stays quiet so that one line can be seen from
 * across the room.
 */

function Row({
  Icon,
  label,
  children,
  loud = false,
}: {
  Icon: typeof Clock;
  label: string;
  children: React.ReactNode;
  loud?: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon
        size={13}
        strokeWidth={2.4}
        className={`mt-px shrink-0 ${loud ? "text-signal" : "text-ink-soft"}`}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-ink-soft">
          {label}
        </span>
        <p
          className={`text-pretty text-xs leading-snug ${
            loud ? "font-bold text-ink" : "font-semibold text-ink-soft"
          }`}
        >
          {children}
        </p>
      </div>
    </div>
  );
}

/**
 * Confidence, with its meaning attached.
 *
 * The label alone would be read as "how likely this is to work", which
 * cosigno cannot know. The subline states what it actually measures every
 * time it appears — this is a caption that must never be dropped for space,
 * because the misreading it prevents is the whole reason the field is
 * allowed on the card at all.
 */
function ConfidenceMeter({ confidence }: { confidence: ApprovalBrief["confidence"] }) {
  const { level, score, gaps } = confidence;
  const pct = Math.round(score * 100);
  return (
    <div className="flex items-start gap-2">
      <Gauge
        size={13}
        strokeWidth={2.4}
        className={`mt-px shrink-0 ${level === "low" ? "text-signal" : "text-ink-soft"}`}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-ink-soft">
          confidence
        </span>
        <div className="flex items-center gap-2">
          <p
            className={`text-xs font-bold ${
              level === "low" ? "text-signal" : "text-ink"
            }`}
          >
            {level}
          </p>
          <div
            className="h-1 w-14 overflow-hidden rounded-pill bg-cream-deep"
            role="img"
            aria-label={`${pct}% of the required details are present`}
          >
            <span
              className={`block h-full origin-left rounded-pill transition-transform duration-slow ease-brand-out ${
                level === "low" ? "bg-signal" : "bg-ink/50"
              }`}
              style={{ transform: `scaleX(${Math.max(0.04, score)})` }}
            />
          </div>
        </div>
        <p className="mt-0.5 text-pretty text-[11px] font-semibold leading-snug text-ink-soft">
          {gaps.length > 0
            ? gaps.join(" · ")
            : "how completely this is specified — not a guess about the outcome."}
        </p>
      </div>
    </div>
  );
}

export function DecisionBrief({ brief }: { brief: ApprovalBrief }) {
  const permanent = brief.risk.level === "permanent";
  return (
    <div className="mt-3 grid gap-3 rounded-btn bg-cream-deep/50 p-3 sm:grid-cols-2">
      <Row Icon={ShieldQuestion} label="why you're being asked">
        {brief.reason}
      </Row>

      <Row
        Icon={permanent ? TriangleAlert : Layers}
        label={`risk — ${brief.risk.label}`}
        loud={permanent}
      >
        {brief.risk.detail}
      </Row>

      <Row Icon={RotateCcw} label="rollback" loud={!brief.rollback.possible}>
        {brief.rollback.detail}
      </Row>

      <ConfidenceMeter confidence={brief.confidence} />

      <div className="flex items-start gap-2">
        <Layers size={13} strokeWidth={2.4} className="mt-px shrink-0 text-ink-soft" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-ink-soft">
            affects
          </span>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {brief.apps.map((app) => (
              // A named connector wears its logo; an unrecognised surface
              // ("your email") is just a word, with no placeholder circle
              // standing in for an icon that was never going to exist.
              <span
                key={app.name}
                className={`inline-flex items-center gap-1.5 rounded-pill bg-surface/80 text-[11px] font-bold shadow-e1 ${
                  app.providerKey ? "py-0.5 pl-0.5 pr-2" : "px-2.5 py-1"
                }`}
              >
                {app.providerKey && (
                  <ConnectorLogo
                    kind="app"
                    providerKey={app.providerKey}
                    displayName={app.name}
                    size={16}
                  />
                )}
                {app.name}
              </span>
            ))}
          </div>
        </div>
      </div>

      <Row Icon={Clock} label="takes">
        {brief.duration} once approved.
      </Row>
    </div>
  );
}
