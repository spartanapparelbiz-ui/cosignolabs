"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Inbox, PenLine, Reply, ShieldCheck, Sunrise } from "lucide-react";
import { useToast } from "@/components/Toast";

/**
 * First-run onboarding — one question, one recommendation, one real mission.
 * "What steals the most time?" maps straight onto a shipped starter job;
 * choosing one starts the actual template mission (sandbox-labeled until the
 * app is connected) and lands in its isolated workspace. Shown once
 * (localStorage flag), dismissable at every step, never blocks a returning
 * user. No workspace configuration, no permission matrices, no pricing.
 */

const SEEN_KEY = "cosigno_intro_seen";

interface Choice {
  key: string;
  icon: typeof Inbox;
  label: string;
  template: string;
  job: string;
  auto: string;
  signature: string;
}

const CHOICES: Choice[] = [
  {
    key: "inbox",
    icon: Inbox,
    label: "my inbox",
    template: "inbox_cleanup",
    job: "clean up my inbox",
    auto: "scans, summarizes what matters, and drafts replies — drafts can never send.",
    signature: "archiving the newsletter clutter. nothing is ever deleted.",
  },
  {
    key: "followups",
    icon: Reply,
    label: "follow-ups I owe",
    template: "followups",
    job: "prepare my follow-ups",
    auto: "finds waiting threads, drafts follow-ups, proposes a send time from your calendar.",
    signature: "sending — and it's verified in Sent Mail after you sign.",
  },
  {
    key: "calendar",
    icon: Sunrise,
    label: "my calendar + mornings",
    template: "daily_brief",
    job: "build my morning brief",
    auto: "reads your schedule and overnight inbox signals, writes the brief.",
    signature: "blocking time for the top item — a separate card.",
  },
];

export function FirstRunIntro() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Choice | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(SEEN_KEY)) setOpen(true);
    } catch {
      // storage unavailable → never block the app
    }
  }, []);

  function markSeen() {
    try {
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // ignore
    }
  }

  function dismiss() {
    markSeen();
    setOpen(false);
  }

  function somethingElse() {
    dismiss();
    // Hand focus to the ask box — the dashboard's composer textarea.
    setTimeout(() => document.querySelector<HTMLTextAreaElement>("textarea")?.focus(), 50);
  }

  async function start(choice: Choice) {
    setBusy(true);
    try {
      const res = await fetch("/api/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: choice.template }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "couldn't start the mission.");
      markSeen();
      setOpen(false);
      toast("success", "your first mission is running.");
      router.push(`/app/missions/${data.mission.id}`);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "couldn't start the mission.");
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="welcome to cosigno"
      onClick={dismiss}
    >
      <div
        className="w-full max-w-md animate-modal-in rounded-card bg-cream p-6 shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        {!picked ? (
          <>
            <h2 className="font-display text-xl font-bold lowercase">what steals the most time?</h2>
            <p className="mt-1.5 text-sm font-semibold text-ink-soft">
              pick one and cosigno recommends a real starter job — you&apos;ll
              see exactly what runs on its own and what waits for your
              signature.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {CHOICES.map((c) => (
                <button
                  key={c.key}
                  onClick={() => setPicked(c)}
                  className="flex items-center gap-3 rounded-btn bg-cream-deep px-4 py-3 text-left text-sm font-bold lowercase transition-colors hover:bg-signal/15"
                >
                  <c.icon size={16} className="shrink-0 text-ink-soft" aria-hidden="true" />
                  {c.label}
                </button>
              ))}
              <button
                onClick={somethingElse}
                className="flex items-center gap-3 rounded-btn bg-cream-deep px-4 py-3 text-left text-sm font-bold lowercase transition-colors hover:bg-signal/15"
              >
                <PenLine size={16} className="shrink-0 text-ink-soft" aria-hidden="true" />
                something else — I&apos;ll type it
              </button>
            </div>
            <button
              onClick={dismiss}
              className="mt-4 text-sm font-bold lowercase text-ink-soft underline underline-offset-2"
            >
              skip — just show me the dashboard
            </button>
          </>
        ) : (
          <>
            <h2 className="font-display text-xl font-bold lowercase">start “{picked.job}”</h2>
            <dl className="mt-3 flex flex-col gap-2.5 text-sm">
              <div>
                <dt className="text-xs font-extrabold lowercase text-ink-soft">runs automatically</dt>
                <dd className="mt-0.5 font-semibold">{picked.auto}</dd>
              </div>
              <div>
                <dt className="text-xs font-extrabold lowercase text-ink-soft">needs your signature</dt>
                <dd className="mt-0.5 font-semibold">{picked.signature}</dd>
              </div>
            </dl>
            <p className="mt-3 flex items-start gap-2 rounded-btn bg-cream-deep px-3 py-2 text-xs font-semibold text-ink-soft">
              <ShieldCheck size={14} className="mt-0.5 shrink-0 text-signal" aria-hidden="true" />
              before your apps are connected, this runs in a clearly-labeled
              sandbox — you&apos;ll see the whole flow with nothing at stake.
            </p>
            <div className="mt-5 flex items-center gap-3">
              <button
                onClick={() => start(picked)}
                disabled={busy}
                className="rounded-btn bg-signal px-5 py-2.5 text-sm font-extrabold text-ink disabled:bg-cream-deep disabled:text-ink-soft disabled:shadow-none disabled:cursor-not-allowed"
              >
                {busy ? "starting…" : "start this job"}
              </button>
              <button
                onClick={() => setPicked(null)}
                disabled={busy}
                className="text-sm font-bold lowercase text-ink-soft underline underline-offset-2"
              >
                back
              </button>
              <button
                onClick={dismiss}
                disabled={busy}
                className="ml-auto text-sm font-bold lowercase text-ink-soft underline underline-offset-2"
              >
                not now
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
