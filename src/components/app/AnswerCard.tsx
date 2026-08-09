"use client";

import { useState } from "react";
import { Check, Copy, Eye, EyeOff, FileDown, RotateCcw } from "lucide-react";
import { useToast } from "@/components/Toast";
import { FORMATS, type ExportFormat } from "@/lib/files/formatList";

/**
 * The answer to a question about attached material.
 *
 * This is the surface that was missing. A question used to come back as a
 * plan to approve; now it comes back as an answer, with two things attached
 * to it that make the answer checkable:
 *
 *  - what was actually looked at, by name;
 *  - what was attached but could NOT be read, and why.
 *
 * The second list is the important one. An operator that quietly skips an
 * unreadable file and answers anyway is how you get a confident description
 * of a photo nobody opened.
 */

export interface AnswerResult {
  answer: string;
  looked_at: string[];
  could_not_read: string[];
  images_seen: number;
}

/**
 * Render the answer as paragraphs and simple bullets. Deliberately not a
 * markdown engine: the operator is asked for plain language, and rendering
 * raw asterisks would be worse than rendering none.
 */
function AnswerBody({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).filter((b) => b.trim());
  return (
    <div className="flex flex-col gap-2.5 text-sm leading-relaxed">
      {blocks.map((block, i) => {
        const lines = block.split("\n").filter((l) => l.trim());
        const bulleted = lines.length > 0 && lines.every((l) => /^\s*[-•*]\s+|^\s*\d+[.)]\s+/.test(l));
        if (bulleted) {
          return (
            <ul key={i} className="flex flex-col gap-1.5">
              {lines.map((line, j) => (
                <li key={j} className="flex gap-2">
                  <span className="mt-[3px] shrink-0 text-ink-soft">•</span>
                  <span>{line.replace(/^\s*[-•*]\s+/, "").replace(/^\s*\d+[.)]\s+/, "")}</span>
                </li>
              ))}
            </ul>
          );
        }
        // A short line ending in a colon reads as a heading, and the operator
        // writes them that way; giving them weight keeps a long report skimmable.
        if (lines.length === 1 && lines[0].length < 80 && lines[0].trim().endsWith(":")) {
          return (
            <p key={i} className="text-xs font-extrabold uppercase tracking-widest text-ink-soft">
              {lines[0].replace(/:$/, "")}
            </p>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap">
            {block}
          </p>
        );
      })}
    </div>
  );
}

/** The formats offered up front; the rest live behind "more formats". */
const PRIMARY: ExportFormat[] = ["pdf", "docx", "xlsx", "pptx"];

export function AnswerCard({
  question,
  result,
  onAskAgain,
  onSave,
  saving,
  streaming = false,
}: {
  question: string;
  result: AnswerResult;
  onAskAgain: () => void;
  onSave: (format: ExportFormat) => void;
  saving: boolean;
  /** True while the answer is still being written. */
  streaming?: boolean;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [moreFormats, setMoreFormats] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(result.answer);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast("error", "your browser blocked copying — select the text instead.");
    }
  }

  const seen =
    result.images_seen > 0
      ? `${result.images_seen} image${result.images_seen === 1 ? "" : "s"} read`
      : null;

  return (
    <div className="mt-5 flex flex-col gap-4 rounded-card border border-line/70 bg-cream/40 p-5">
      <div>
        <p className="text-xs font-extrabold uppercase tracking-widest text-ink-soft">Answer</p>
        <p className="mt-0.5 text-[11px] font-semibold text-ink-soft">{question}</p>
      </div>

      {result.answer ? (
        <div>
          <AnswerBody text={result.answer} />
          {/* A caret while writing: the answer is arriving, not stalled. */}
          {streaming && (
            <span
              aria-hidden="true"
              className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-ink align-text-bottom"
            />
          )}
        </div>
      ) : (
        <p className="text-sm font-semibold text-ink-soft" aria-live="polite">
          {result.images_seen > 0
            ? `reading ${result.images_seen} image${result.images_seen === 1 ? "" : "s"}…`
            : "reading…"}
        </p>
      )}

      {/* Anything that could not be read is stated up front, never buried. */}
      {result.could_not_read.length > 0 && (
        <div className="flex flex-col gap-1 rounded-btn bg-signal/10 px-3 py-2 text-sm font-semibold ring-1 ring-inset ring-signal/30">
          <p className="text-xs font-extrabold uppercase tracking-widest text-ink-soft">
            Not read — not included above
          </p>
          {result.could_not_read.map((c, i) => (
            <p key={i}>• {c}</p>
          ))}
        </div>
      )}

      {/*
        Exporting is offered only once the answer is complete — a PDF of half
        a report is worse than no PDF.
      */}
      {!streaming && result.answer && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-extrabold uppercase tracking-widest text-ink-soft">Save as</span>
            {PRIMARY.map((id) => {
              const def = FORMATS.find((f) => f.id === id)!;
              return (
                <button
                  key={id}
                  onClick={() => onSave(id)}
                  disabled={saving}
                  title={def.description}
                  className="inline-flex items-center gap-1.5 rounded-btn bg-signal px-3.5 py-2 text-xs font-extrabold text-ink shadow-soft transition-transform active:scale-95 disabled:cursor-not-allowed disabled:bg-cream-deep disabled:text-ink-soft disabled:shadow-none"
                >
                  <FileDown size={13} /> {def.label}
                </button>
              );
            })}
            <button
              onClick={() => setMoreFormats((v) => !v)}
              aria-expanded={moreFormats}
              className="rounded-btn border border-line/70 px-3 py-2 text-xs font-bold text-ink-soft transition-colors hover:bg-cream-deep hover:text-ink"
            >
              {moreFormats ? "Fewer" : "More formats"}
            </button>
          </div>

          {moreFormats && (
            <div className="flex flex-wrap items-center gap-2">
              {FORMATS.filter((f) => !PRIMARY.includes(f.id)).map((def) => (
                <button
                  key={def.id}
                  onClick={() => onSave(def.id)}
                  disabled={saving}
                  title={def.description}
                  className="inline-flex items-center gap-1.5 rounded-btn border border-line/70 px-3 py-1.5 text-xs font-bold text-ink-soft transition-colors hover:bg-cream-deep hover:text-ink disabled:cursor-not-allowed"
                >
                  {def.label}
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={copy}
              className="inline-flex items-center gap-1.5 rounded-btn border border-line/70 px-3 py-2 text-xs font-bold text-ink-soft transition-colors hover:bg-cream-deep hover:text-ink"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
            </button>
            <button
              onClick={onAskAgain}
              className="inline-flex items-center gap-1.5 rounded-btn border border-line/70 px-3 py-2 text-xs font-bold text-ink-soft transition-colors hover:bg-cream-deep hover:text-ink"
            >
              <RotateCcw size={13} /> Ask something else
            </button>
          </div>
        </div>
      )}

      {result.looked_at.length > 0 && (
        <div>
          <button
            onClick={() => setShowSources((v) => !v)}
            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-ink-soft hover:text-ink"
          >
            {showSources ? <EyeOff size={12} /> : <Eye size={12} />}
            {showSources ? "Hide what was read" : "What was read"}
            {seen && <span className="font-semibold">· {seen}</span>}
          </button>
          {showSources && (
            <p className="mt-1 text-[11px] text-ink-soft">Read: {result.looked_at.join(" · ")}</p>
          )}
        </div>
      )}
    </div>
  );
}
