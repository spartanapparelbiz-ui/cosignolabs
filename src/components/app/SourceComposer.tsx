"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  FileText,
  Image as ImageIcon,
  Link2,
  Loader2,
  Lock,
  Paperclip,
  Plug,
  Sparkles,
  X,
} from "lucide-react";
import type { MissionSourceRecord, MissionSourceStatus } from "@/lib/types";
import { useToast } from "@/components/Toast";

/**
 * The ask-box body: a place to type a request and, without leaving the
 * dashboard, add files and links that explain it. Everything shown is REAL —
 * a source appears only after the server actually processed it, and its status
 * says exactly what happened (read / unsupported / login required / blocked).
 * Nothing starts until the user confirms the goal-understanding screen.
 */

const EXAMPLES = [
  "prepare tomorrow's meeting",
  "review my unread emails",
  "research the best option",
  "summarize this document",
];

const ACCEPT = ".pdf,.docx,.txt,.md,.markdown,.csv,.png,.jpg,.jpeg,.webp";

/** Statuses that mean "still working" — the mission can't start yet. */
const IN_PROGRESS: MissionSourceStatus[] = ["uploading", "processing", "checking", "reading"];

interface StatusView {
  label: string;
  tone: "working" | "ok" | "warn";
}

function statusView(s: MissionSourceRecord): StatusView {
  switch (s.status) {
    case "uploading":
      return { label: "Uploading…", tone: "working" };
    case "processing":
      return { label: "Processing…", tone: "working" };
    case "checking":
      return { label: "Checking link…", tone: "working" };
    case "reading":
      return { label: "Reading page…", tone: "working" };
    case "ready":
      return { label: s.kind === "link" ? "Read" : "Ready", tone: "ok" };
    case "unsupported":
      return { label: "Unsupported", tone: "warn" };
    case "login_required":
      return { label: "Login required", tone: "warn" };
    case "blocked":
      return { label: "Blocked by site", tone: "warn" };
    case "could_not_access":
      return { label: "Couldn't open", tone: "warn" };
    case "failed":
    default:
      return { label: "Couldn't read", tone: "warn" };
  }
}

/** The honest one-line reason shown under a source when something went wrong. */
function reasonOf(s: MissionSourceRecord): string | null {
  const d = s.detail ?? {};
  const msg = typeof d.message === "string" ? d.message : typeof d.error === "string" ? d.error : null;
  if (msg) return msg;
  if (s.status === "login_required") return "this page needs a sign-in cosigno doesn't have.";
  if (s.status === "blocked") return "the website blocked automated reading.";
  return null;
}

function fmtBytes(n: number): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

async function jsonFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || body.error || "something went wrong.");
  return body;
}

interface CompilePreview {
  understood: { normalizedGoal: string; willDo: string[]; boundary: string; informationProvided: string[] };
  blocked: boolean;
  plan: { expectedDeliverables: string[]; approvalCheckpoints: string[]; unsupported: string[] };
}

/* ------------------------------------------------------------------ */

function SourceRow({ source, onRemove }: { source: MissionSourceRecord; onRemove: (id: string) => void }) {
  const sv = statusView(source);
  const reason = reasonOf(source);
  const isImage = source.kind === "file" && source.subtype.startsWith("image/");
  const Icon = source.kind === "link" ? Link2 : isImage ? ImageIcon : FileText;
  const toneCls =
    sv.tone === "ok"
      ? "bg-signal/15 text-ink"
      : sv.tone === "warn"
        ? "text-ink ring-1 ring-inset ring-ink/30"
        : "bg-cream-deep text-ink-soft";
  return (
    <div className="flex items-start gap-2.5 rounded-btn border border-line/70 bg-cream/40 px-3 py-2">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-surface text-ink-soft">
        {source.status === "login_required" ? <Lock size={13} /> : sv.tone === "warn" ? <AlertTriangle size={13} /> : <Icon size={13} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-sm font-bold" title={source.name}>
            {source.name}
          </p>
          <span className={`inline-flex shrink-0 items-center gap-1 rounded-pill px-2 py-0.5 text-[10px] font-bold ${toneCls}`}>
            {IN_PROGRESS.includes(source.status) && <Loader2 size={10} className="animate-spin" aria-hidden="true" />}
            {sv.label}
          </span>
        </div>
        <p className="truncate text-[11px] text-ink-soft">
          {source.kind === "link"
            ? source.subtype || "link"
            : [source.subtype.replace(/^application\/|^text\//, "").replace("vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"), fmtBytes(source.size_bytes)]
                .filter(Boolean)
                .join(" · ")}
          {source.injection_flag && " · flagged content (kept as data only)"}
        </p>
        {reason && <p className="mt-0.5 text-[11px] font-semibold text-ink-soft">{reason}</p>}
      </div>
      <button
        onClick={() => onRemove(source.id)}
        aria-label={`remove ${source.name}`}
        className="mt-0.5 shrink-0 rounded-md p-1 text-ink-soft transition-colors hover:bg-cream-deep hover:text-ink"
      >
        <X size={14} />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function SourceComposer({
  onStarted,
  suggestions,
}: {
  onStarted: () => void;
  /** Contextual delegation prompts (from real connected apps); defaults to the generic set. */
  suggestions?: string[];
}) {
  const router = useRouter();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [goal, setGoal] = useState("");
  const [sources, setSources] = useState<MissionSourceRecord[]>([]);
  // Optimistic placeholders keyed by a temp id, shown while a request is in flight.
  const [pending, setPending] = useState<MissionSourceRecord[]>([]);

  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [addingLink, setAddingLink] = useState(false);

  const [preview, setPreview] = useState<CompilePreview | null>(null);
  const [busy, setBusy] = useState(false);

  const loadSources = useCallback(async () => {
    try {
      const data = await jsonFetch("/api/sources");
      setSources(data.sources ?? []);
    } catch {
      /* leave as-is */
    }
  }, []);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  const all = [...sources, ...pending];
  const anyWorking = all.some((s) => IN_PROGRESS.includes(s.status));

  /* ---- file upload ---- */
  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      const tempId = `tmp-${Math.random().toString(36).slice(2)}`;
      const placeholder: MissionSourceRecord = {
        id: tempId,
        user_id: "",
        mission_id: null,
        kind: "file",
        name: file.name,
        subtype: file.type || "",
        size_bytes: file.size,
        status: "uploading",
        summary: "",
        injection_flag: false,
        detail: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setPending((p) => [...p, placeholder]);
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/sources/file", { method: "POST", body: form });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.message || "upload failed.");
        setPending((p) => p.filter((x) => x.id !== tempId));
        setSources((s) => [...s, body.source as MissionSourceRecord]);
      } catch (e) {
        setPending((p) => p.filter((x) => x.id !== tempId));
        toast("error", e instanceof Error ? e.message : "that file couldn't be uploaded.");
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  /* ---- link add ---- */
  async function addLink() {
    const url = linkUrl.trim();
    if (!url || addingLink) return;
    setAddingLink(true);
    const tempId = `tmp-${Math.random().toString(36).slice(2)}`;
    setPending((p) => [
      ...p,
      {
        id: tempId,
        user_id: "",
        mission_id: null,
        kind: "link",
        name: url,
        subtype: "",
        size_bytes: 0,
        status: "checking",
        summary: "",
        injection_flag: false,
        detail: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);
    try {
      const body = await jsonFetch("/api/sources/link", { method: "POST", body: JSON.stringify({ url }) });
      setPending((p) => p.filter((x) => x.id !== tempId));
      setSources((s) => [...s, body.source as MissionSourceRecord]);
      setLinkUrl("");
      setLinkOpen(false);
    } catch (e) {
      setPending((p) => p.filter((x) => x.id !== tempId));
      toast("error", e instanceof Error ? e.message : "that link couldn't be added.");
    } finally {
      setAddingLink(false);
    }
  }

  async function removeSource(id: string) {
    if (id.startsWith("tmp-")) return; // in-flight; ignore
    setSources((s) => s.filter((x) => x.id !== id));
    try {
      await fetch(`/api/sources/${id}`, { method: "DELETE" });
    } catch {
      /* best-effort; it stays removed locally */
    }
  }

  /* ---- compile (understanding screen) ---- */
  async function review() {
    const g = goal.trim();
    if (!g || busy) return;
    if (anyWorking) {
      toast("error", "give your files and links a moment to finish first.");
      return;
    }
    setBusy(true);
    try {
      const data = await jsonFetch("/api/missions/compile", {
        method: "POST",
        body: JSON.stringify({ goal: g, sourceIds: sources.map((s) => s.id) }),
      });
      setPreview(data as CompilePreview);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "couldn't read that request — try rephrasing it.");
    } finally {
      setBusy(false);
    }
  }

  /* ---- confirm & start ---- */
  async function start() {
    const g = goal.trim();
    if (!g || busy) return;
    setBusy(true);
    try {
      await jsonFetch("/api/missions", {
        method: "POST",
        body: JSON.stringify({ goal: g, sourceIds: sources.map((s) => s.id) }),
      });
      toast("success", "mission started — opening it now.");
      setPreview(null);
      setGoal("");
      setSources([]);
      onStarted();
      router.push("/app/missions");
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "couldn't start that — try rephrasing the goal.");
      setBusy(false);
    }
  }

  /* ---------------- understanding screen ---------------- */
  if (preview) {
    const p = preview.plan;
    return (
      <div className="mt-5 flex flex-col gap-4 rounded-card border border-line/70 bg-cream/40 p-5">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-widest text-ink-soft">I understand the goal</p>
          <p className="mt-1 text-base font-extrabold">{preview.understood.normalizedGoal}</p>
        </div>

        <div>
          <p className="text-xs font-extrabold uppercase tracking-widest text-ink-soft">Information provided</p>
          <ul className="mt-1.5 flex flex-col gap-1 text-sm">
            {preview.understood.informationProvided.map((line, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-ink-soft">•</span>
                <span className="font-semibold">{line}</span>
              </li>
            ))}
          </ul>
        </div>

        {preview.understood.willDo.length > 0 && (
          <div>
            <p className="text-xs font-extrabold uppercase tracking-widest text-ink-soft">I will help by</p>
            <ol className="mt-1.5 flex flex-col gap-1 text-sm">
              {preview.understood.willDo.map((w, i) => (
                <li key={i} className="font-semibold">
                  {i + 1}. {w}
                </li>
              ))}
            </ol>
          </div>
        )}

        <div>
          <p className="text-xs font-extrabold uppercase tracking-widest text-ink-soft">Important boundaries</p>
          <p className="mt-1.5 text-sm font-semibold">{preview.understood.boundary}</p>
          {p.unsupported.length > 0 && (
            <div className="mt-2 flex flex-col gap-1 rounded-btn bg-signal/10 px-3 py-2 text-sm font-semibold ring-1 ring-inset ring-signal/30">
              {p.unsupported.map((u, i) => (
                <p key={i}>• {u}</p>
              ))}
            </div>
          )}
        </div>

        {p.expectedDeliverables.length > 0 && (
          <p className="text-sm text-ink-soft">
            <span className="font-bold text-ink">You&apos;ll get:</span> {p.expectedDeliverables.join(", ")}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {preview.blocked ? (
            <p className="text-sm font-bold text-ink-soft">This can&apos;t run as-is — see the boundaries above.</p>
          ) : (
            <button
              onClick={start}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-btn bg-signal px-5 py-2.5 text-sm font-extrabold text-ink shadow-soft transition-transform active:scale-95 disabled:opacity-40"
            >
              <Sparkles size={15} /> {busy ? "Starting…" : "Start Mission"}
            </button>
          )}
          <button
            onClick={() => setPreview(null)}
            className="rounded-btn px-4 py-2.5 text-sm font-bold ring-1 ring-inset ring-ink transition-colors hover:bg-cream-deep"
          >
            Edit request
          </button>
        </div>
      </div>
    );
  }

  /* ---------------- ask box ---------------- */
  const controlBtn =
    "inline-flex items-center gap-1.5 rounded-pill border border-line/70 bg-cream/40 px-3.5 py-1.5 text-sm font-bold text-ink-soft transition-colors hover:border-ink/30 hover:text-ink";

  return (
    <div>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <input
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && review()}
          maxLength={500}
          placeholder="Ask cosigno to handle something…"
          aria-label="what do you need handled"
          className="w-full rounded-btn border border-line/70 bg-cream/40 px-4 py-3.5 text-base font-semibold shadow-well placeholder:font-medium placeholder:text-ink-soft/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
        />
        <button
          onClick={review}
          disabled={busy || !goal.trim()}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-btn bg-signal px-6 py-3.5 text-base font-extrabold text-ink shadow-soft transition-transform active:scale-95 disabled:opacity-40"
        >
          <Sparkles size={16} /> {busy ? "Reading…" : "Start Mission"}
        </button>
      </div>

      {/* control row */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input ref={fileRef} type="file" accept={ACCEPT} multiple hidden onChange={(e) => onFiles(e.target.files)} />
        <button onClick={() => fileRef.current?.click()} className={controlBtn}>
          <Paperclip size={14} /> Add file
        </button>
        <button onClick={() => setLinkOpen((v) => !v)} className={controlBtn} aria-expanded={linkOpen}>
          <Link2 size={14} /> Add link
        </button>
        <button onClick={() => router.push("/app/connections")} className={controlBtn}>
          <Plug size={14} /> Choose apps
        </button>
        {anyWorking && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-ink-soft">
            <Loader2 size={11} className="animate-spin" aria-hidden="true" /> finishing your files…
          </span>
        )}
      </div>

      {/* compact link field */}
      {linkOpen && (
        <div className="mt-3 flex flex-col gap-2 rounded-btn border border-line/70 bg-cream/40 p-3 sm:flex-row sm:items-center">
          <input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addLink()}
            maxLength={2048}
            placeholder="Paste a link (https://…)"
            aria-label="paste a link"
            className="w-full min-w-0 rounded-btn border border-line/70 bg-surface px-3 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
          />
          <div className="flex shrink-0 gap-2">
            <button
              onClick={addLink}
              disabled={addingLink || !linkUrl.trim()}
              className="rounded-btn bg-ink px-4 py-2 text-sm font-bold text-cream disabled:opacity-40"
            >
              {addingLink ? "Adding…" : "Add"}
            </button>
            <button
              onClick={() => {
                setLinkOpen(false);
                setLinkUrl("");
              }}
              className="rounded-btn px-4 py-2 text-sm font-bold text-ink-soft ring-1 ring-inset ring-ink/20 hover:bg-cream-deep hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* staged sources */}
      {all.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {all.map((s) => (
            <SourceRow key={s.id} source={s} onRemove={removeSource} />
          ))}
        </div>
      )}

      {/* examples */}
      <div className="mt-4 flex flex-wrap gap-2">
        {(suggestions ?? EXAMPLES).map((ex) => (
          <button
            key={ex}
            onClick={() => setGoal(ex)}
            className="rounded-pill border border-line/70 bg-cream/40 px-3.5 py-1.5 text-sm font-semibold text-ink-soft transition-colors hover:border-ink/30 hover:text-ink"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}
