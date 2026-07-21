"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarClock, Globe } from "lucide-react";
import { useToast } from "@/components/Toast";

/**
 * The installable jobs that ACTUALLY run today — each maps to a real mission
 * template the engine executes end to end. Honesty rules: apps listed are the
 * ones really used (with the labeled sandbox until they're connected), the
 * auto/signature split is the real one the engine enforces, and nothing here
 * is listed unless its complete backend works.
 */

interface TemplateJob {
  key: "meeting_prep" | "laptop_compare";
  icon: typeof CalendarClock;
  title: string;
  outcome: string;
  apps: string;
  auto: string;
  signature: string;
  usage: string;
  /** Where to land after the mission is created. */
  dest: (missionId: string) => string;
}

const JOBS: TemplateJob[] = [
  {
    key: "meeting_prep",
    icon: CalendarClock,
    title: "build tomorrow's meeting brief",
    outcome: "a meeting brief, an agenda, and a drafted (never sent) follow-up.",
    apps: "Google Calendar, Gmail, Drive — or a clearly-labeled sandbox until they're connected.",
    auto: "finds the event, reviews related mail and files, drafts everything.",
    signature: "sending the follow-up email.",
    usage: "≈ 7 actions per run",
    dest: () => "/app/missions",
  },
  {
    key: "laptop_compare",
    icon: Globe,
    title: "compare three laptops under $1,000",
    outcome: "a comparison report and a data-supported recommendation, stopped at the product page.",
    apps: "the browser operator on major retailer sites — or the labeled sandbox.",
    auto: "searches, reads three product pages, compares, recommends, saves the report.",
    signature: "nothing — this job is entirely read-only and never attempts a purchase.",
    usage: "≈ 10 actions per run",
    dest: (id) => `/app/browser/${id}`,
  },
];

export function TemplateGallery() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function use(job: TemplateJob) {
    setBusy(job.key);
    try {
      const res = await fetch("/api/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: job.key }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "couldn't start the mission.");
      toast("success", "mission started.");
      router.push(job.dest(data.mission.id));
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "couldn't start the mission.");
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-5 md:grid-cols-2">
      {JOBS.map((job) => {
        const Icon = job.icon;
        return (
          <article key={job.key} className="flex flex-col rounded-card border border-line/70 bg-surface p-5 shadow-soft">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-btn bg-cream-deep">
                <Icon size={17} className="text-ink-soft" aria-hidden="true" />
              </span>
              <h2 className="text-base font-extrabold lowercase">{job.title}</h2>
            </div>
            <dl className="mt-3 flex flex-1 flex-col gap-2 text-xs">
              <div>
                <dt className="font-extrabold lowercase text-ink-soft">you get</dt>
                <dd className="mt-0.5 font-semibold">{job.outcome}</dd>
              </div>
              <div>
                <dt className="font-extrabold lowercase text-ink-soft">uses</dt>
                <dd className="mt-0.5 font-semibold">{job.apps}</dd>
              </div>
              <div>
                <dt className="font-extrabold lowercase text-ink-soft">runs automatically</dt>
                <dd className="mt-0.5 font-semibold">{job.auto}</dd>
              </div>
              <div>
                <dt className="font-extrabold lowercase text-ink-soft">needs your signature</dt>
                <dd className="mt-0.5 font-semibold">{job.signature}</dd>
              </div>
            </dl>
            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="text-[11px] font-semibold text-ink-soft">{job.usage} (estimate)</span>
              <button
                onClick={() => use(job)}
                disabled={busy !== null}
                className="rounded-btn bg-signal px-4 py-2 text-sm font-extrabold text-ink shadow-soft transition-transform active:scale-95 disabled:opacity-40"
              >
                {busy === job.key ? "starting…" : "use template"}
              </button>
            </div>
          </article>
        );
      })}
      <p className="text-xs font-semibold text-ink-soft md:col-span-2">
        anything else? type it in the ask box on{" "}
        <a href="/app" className="underline underline-offset-2">home</a> — cosigno
        compiles open-ended goals into plans from its real capabilities and shows
        you before anything runs.
      </p>
    </div>
  );
}
