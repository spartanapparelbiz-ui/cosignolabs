"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Inbox, PenLine, Plane, Reply, ShieldCheck, Sunrise, Tag, Telescope } from "lucide-react";
import { useToast } from "@/components/Toast";

/**
 * First-run onboarding — one question, one recommendation, one real mission.
 *
 * The question used to be "what steals the most time?", answered by three
 * inbox and calendar chores, which is the right question for an inbox product
 * and too small for this one. It asks what cosigno should help with, and the
 * answers span the work it can actually finish — a trip, a purchase, a
 * question, as well as the inbox.
 *
 * Choosing one starts a REAL mission (sandbox-labeled until the app is
 * connected) and lands in its workspace. Where the work is open-ended, the
 * suggested subject is editable before it runs: someone who taps "something
 * I'm buying" has told us the shape of the job, not what they are buying, and
 * launching a mission about a laptop they never mentioned would be putting
 * words in their mouth.
 *
 * Shown once (localStorage flag), dismissable at every step, never blocks a
 * returning user. No workspace configuration, no permission matrices, no
 * pricing.
 */

const SEEN_KEY = "cosigno_intro_seen";

interface Choice {
  key: string;
  icon: typeof Inbox;
  label: string;
  job: string;
  auto: string;
  signature: string;
  /** A shipped template — starts on the user's own connected data. */
  template?: string;
  /**
   * An open-ended goal, shown EDITABLE before it runs. The subject is a
   * suggestion, not an assumption: starting a canned mission about headphones
   * because someone tapped "shopping" is putting words in their mouth, and
   * they would have to stop it to say what they actually wanted.
   */
  goal?: string;
}

/**
 * What someone might hand over first. Only work the product can actually
 * finish appears here — an opening move that produces a confident wrong
 * answer is a worse introduction than a shorter list.
 */
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
  {
    key: "travel",
    icon: Plane,
    label: "a trip I'm planning",
    goal: "Research a weekend in Miami for under $800 and compare the options",
    job: "research a trip",
    auto: "searches, opens what it finds, records only what the pages actually show, and ranks the options.",
    signature: "nothing — researching is read-only. booking anything would be its own card, with the total and the cancellation date on it.",
  },
  {
    key: "shopping",
    icon: Tag,
    label: "something I'm buying",
    goal: "Find the best price for a 14-inch laptop under $1,000",
    job: "compare what's out there",
    auto: "opens the product pages, records the prices they actually publish, and compares them.",
    signature: "nothing — it stops at the recommended page. it never buys.",
  },
  {
    key: "research",
    icon: Telescope,
    label: "something I need to know",
    goal: "Research this company and tell me what I should know before my interview",
    job: "research it properly",
    auto: "gathers sources, compares what they say, and writes it up with every link it used.",
    signature: "nothing — this one only reads.",
  },
];

export function FirstRunIntro() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Choice | null>(null);
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState(false);

  /** Picking an open-ended choice loads its suggestion into an editable field. */
  function pick(choice: Choice) {
    setGoal(choice.goal ?? "");
    setPicked(choice);
  }

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
        body: JSON.stringify(
          choice.template ? { template: choice.template } : { goal: goal.trim() }
        ),
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
            <h2 className="font-display text-xl font-bold lowercase">what should cosigno help you with?</h2>
            <p className="mt-1.5 text-sm font-semibold text-ink-soft">
              pick one and cosigno recommends a real starter job — you&apos;ll
              see exactly what runs on its own and what waits for your
              signature.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {CHOICES.map((c) => (
                <button
                  key={c.key}
                  onClick={() => pick(c)}
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

            {/* Open-ended work: the subject is theirs to set before it runs. */}
            {picked.goal !== undefined && (
              <label className="mt-3 block">
                <span className="text-xs font-extrabold lowercase text-ink-soft">
                  what should it look into?
                </span>
                <textarea
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  rows={2}
                  className="mt-1 w-full resize-none rounded-btn border border-line/70 bg-cream-deep px-3 py-2 text-sm font-semibold shadow-well focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
                />
              </label>
            )}

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
                disabled={busy || (picked.goal !== undefined && goal.trim().length === 0)}
                className="rounded-btn bg-signal px-5 py-2.5 text-sm font-extrabold text-on-signal disabled:bg-cream-deep disabled:text-ink-soft disabled:shadow-none disabled:cursor-not-allowed"
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
