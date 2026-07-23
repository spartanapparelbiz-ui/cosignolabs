"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Inbox, Reply, Sunrise } from "lucide-react";
import { useToast } from "@/components/Toast";

/**
 * The three starter jobs, always visible under the ask box — one click starts
 * the real template mission and lands in its isolated workspace. Same
 * missions the template gallery creates; this is just the shortest path to a
 * first useful result.
 */

const JOBS = [
  { key: "inbox_cleanup", icon: Inbox, label: "clean up my inbox" },
  { key: "followups", icon: Reply, label: "prepare my follow-ups" },
  { key: "daily_brief", icon: Sunrise, label: "build my morning brief" },
] as const;

export function StarterJobs() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function start(key: string) {
    setBusy(key);
    try {
      const res = await fetch("/api/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: key }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "couldn't start the mission.");
      toast("success", "mission started.");
      router.push(`/app/missions/${data.mission.id}`);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "couldn't start the mission.");
      setBusy(null);
    }
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <span className="text-xs font-bold lowercase text-ink-soft">or start a job:</span>
      {JOBS.map((job) => (
        <button
          key={job.key}
          onClick={() => start(job.key)}
          disabled={busy !== null}
          className="flex items-center gap-1.5 rounded-pill bg-cream-deep px-3 py-1.5 text-xs font-bold lowercase transition-colors hover:bg-signal/15 disabled:opacity-40"
        >
          <job.icon size={13} className="text-ink-soft" aria-hidden="true" />
          {busy === job.key ? "starting…" : job.label}
        </button>
      ))}
    </div>
  );
}
