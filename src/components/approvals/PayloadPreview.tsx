"use client";

import type { ActionRecord } from "@/lib/types";
import { extractDiff } from "@/lib/actionPresentation";

/**
 * What would actually be sent, shown as the thing it is.
 *
 * A JSON blob is a complete and accurate description of an email that nobody
 * reads carefully enough to catch the wrong recipient in. When a payload is
 * message-shaped, this renders it as a message — addressed, subject line,
 * body — because that is the form in which a person spots the mistake. A
 * change-shaped payload becomes a before → after table for the same reason.
 *
 * Anything else falls through to the exact payload, unedited. The raw view is
 * always one click away from the shaped one: the shaped view is easier to
 * read, and the raw view is the one that is guaranteed complete, so neither
 * can be the only option.
 */

/** Payload keys that carry the visible parts of a message. */
function messageOf(payload: Record<string, unknown>) {
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const to = str(payload.to) ?? str(payload.recipient);
  const subject = str(payload.subject);
  const body = str(payload.body) ?? str(payload.content) ?? str(payload.text);
  if (!body && !subject) return null;
  return { to, subject, body, cc: str(payload.cc), from: str(payload.from) };
}

export function PayloadPreview({
  action,
  raw,
}: {
  action: ActionRecord;
  /** Force the exact payload, skipping the shaped views. */
  raw?: boolean;
}) {
  const payload = action.payload ?? {};

  if (raw) {
    return (
      <pre className="max-h-56 overflow-auto rounded-btn bg-cream-deep px-3 py-2.5 font-mono text-[11px] leading-relaxed text-ink shadow-well">
        {JSON.stringify(payload, null, 2)}
      </pre>
    );
  }

  const message =
    action.category === "send_email" || action.category === "draft" || action.category === "post_content"
      ? messageOf(payload)
      : null;

  if (message) {
    return (
      <div className="overflow-hidden rounded-btn bg-surface shadow-well">
        <div className="flex flex-col gap-0.5 border-b border-line/70 px-3 py-2">
          {message.to && <Header label="to" value={message.to} />}
          {message.cc && <Header label="cc" value={message.cc} />}
          {message.subject && <Header label="subject" value={message.subject} strong />}
        </div>
        {message.body && (
          <p className="max-h-48 overflow-auto whitespace-pre-wrap px-3 py-2.5 text-pretty text-xs leading-relaxed">
            {message.body}
          </p>
        )}
      </div>
    );
  }

  const diff = extractDiff(payload);
  if (diff) {
    return (
      <div className="overflow-hidden rounded-btn bg-cream-deep shadow-well">
        <p className="px-3 pt-2 text-[10px] font-extrabold uppercase tracking-widest text-ink-soft">
          before → after
        </p>
        <div className="overflow-x-auto">
          <table className="w-full font-mono text-[11px] leading-relaxed">
            <tbody>
              {diff.map((row) => (
                <tr key={row.field} className="border-t border-line/50 first:border-0">
                  <td className="px-3 py-1.5 align-top font-bold text-ink-soft">{row.field}</td>
                  <td className="px-2 py-1.5 align-top text-ink-soft line-through decoration-ink/40">
                    {row.before}
                  </td>
                  <td className="px-1 py-1.5 align-top text-ink-soft" aria-hidden="true">
                    →
                  </td>
                  <td className="px-3 py-1.5 align-top font-bold text-ink">{row.after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <pre className="max-h-56 overflow-auto rounded-btn bg-cream-deep px-3 py-2.5 font-mono text-[11px] leading-relaxed text-ink shadow-well">
      {JSON.stringify(payload, null, 2)}
    </pre>
  );
}

function Header({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <p className="flex gap-2 text-xs">
      <span className="w-12 shrink-0 text-[10px] font-extrabold uppercase tracking-widest text-ink-soft">
        {label}
      </span>
      <span className={`min-w-0 flex-1 break-words ${strong ? "font-extrabold" : "font-mono font-semibold"}`}>
        {value}
      </span>
    </p>
  );
}
