"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Inbox, PenLine, Reply, Sunrise } from "lucide-react";
import { useToast } from "@/components/Toast";
import { btn } from "@/components/ui/styles";

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
        className="w-full max-w-md animate-modal-in rounded-card bg-surface p-7 shadow-overlay"
        onClick={(e) => e.stopPropagation()}
      >
        {!picked ? (
          <>
            <h2 className="t-display text-[1.375rem] sm:text-[1.5rem]">
              What steals the most time?
            </h2>
            <p className="t-caption mt-2">
              Pick one and cosigno suggests a real starter job — you&apos;ll see exactly
              what runs on its own and what waits for your signature.
            </p>
            <div className="-mx-3 mt-6 flex flex-col">
              {CHOICES.map((c) => (
                <button
                  key={c.key}
                  onClick={() => setPicked(c)}
                  className="flex items-center gap-3 rounded-btn px-3 py-2.5 text-left text-[0.9375rem] transition-colors duration-fast hover:bg-ink/[0.04]"
                >
                  <c.icon size={15} strokeWidth={1.9} className="shrink-0 text-ink-soft" aria-hidden="true" />
                  {c.label}
                </button>
              ))}
              <button
                onClick={somethingElse}
                className="flex items-center gap-3 rounded-btn px-3 py-2.5 text-left text-[0.9375rem] transition-colors duration-fast hover:bg-ink/[0.04]"
              >
                <PenLine size={15} strokeWidth={1.9} className="shrink-0 text-ink-soft" aria-hidden="true" />
                Something else — I&apos;ll type it
              </button>
            </div>
            <button onClick={dismiss} className={btn("ghost", "sm", "-ml-3 mt-5")}>
              Skip
            </button>
          </>
        ) : (
          <>
            <h2 className="t-display text-[1.375rem] sm:text-[1.5rem]">{picked.job}</h2>
            <dl className="mt-6 flex flex-col gap-5">
              <div>
                <dt className="t-eyebrow">Runs automatically</dt>
                <dd className="t-body mt-1">{picked.auto}</dd>
              </div>
              <div>
                <dt className="t-eyebrow">Needs your signature</dt>
                <dd className="t-body mt-1">{picked.signature}</dd>
              </div>
            </dl>
            <p className="t-caption mt-6">
              Until your apps are connected this runs in a clearly-labeled sandbox — the
              whole flow, with nothing at stake.
            </p>
            <div className="mt-8 flex items-center gap-1.5">
              <button onClick={() => start(picked)} disabled={busy} className={btn("primary", "md")}>
                {busy ? "Starting…" : "Start this job"}
              </button>
              <button onClick={() => setPicked(null)} disabled={busy} className={btn("ghost", "md")}>
                Back
              </button>
              <button onClick={dismiss} disabled={busy} className={btn("ghost", "md", "ml-auto")}>
                Not now
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
