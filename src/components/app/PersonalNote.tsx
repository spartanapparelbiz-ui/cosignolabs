"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { LearnedPreference } from "@/lib/personalization/preferences";

/**
 * ONE LINE ABOUT HOW COSIGNO IS ADAPTING TO YOU.
 *
 * Personalization that is never mentioned feels like nothing; personalization
 * that is mentioned constantly feels like being watched. The line between
 * "it knows how I work" and "it is studying me" is mostly frequency, so this
 * component is deliberately stingy:
 *
 *   · one preference, never a list
 *   · only high-confidence ones, so it is never wrong out loud
 *   · always with the evidence, so it can be argued with
 *   · always one click from turning it off
 *
 * Renders nothing at all until cosigno has genuinely learned something, which
 * on a new account is the correct amount of personality to have.
 */
export function PersonalNote() {
  const [note, setNote] = useState<LearnedPreference | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/personalization")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { preferences?: LearnedPreference[] } | null) => {
        if (!alive || !d?.preferences) return;
        setNote(d.preferences.find((p) => p.confidence === "high") ?? null);
      })
      .catch(() => {
        /* a missing note is not a problem worth reporting */
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!note) return null;

  return (
    <aside className="mt-8 animate-rise-in rounded-card border border-line/60 bg-cream-deep/40 px-4 py-3">
      <p className="text-xs font-bold leading-relaxed">
        <span className="text-ink-soft">cosigno: </span>
        {note.behavior}
      </p>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] font-semibold text-ink-soft">
        <span>{note.because}</span>
        <Link
          href="/app/account?tab=profile"
          className="underline underline-offset-2 hover:text-ink"
        >
          Change what cosigno learns
        </Link>
      </p>
    </aside>
  );
}
