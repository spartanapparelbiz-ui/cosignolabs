"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  FileText,
  Image as ImageIcon,
  Link2,
  Loader2,
  Lock,
  Paperclip,
  Plug,
  X,
} from "lucide-react";
import type { MissionSourceRecord, MissionSourceStatus } from "@/lib/types";
import { classifyDelegation, returnCondition } from "@/lib/delegate";
import { useToast } from "@/components/Toast";
import { useBackgroundExecution } from "./useBackgroundExecution";
import { badge, btn, card, field } from "@/components/ui/styles";

/**
 * The ask-box body: a place to type a request and, without leaving the
 * dashboard, add files and links that explain it. Everything shown is REAL —
 * a source appears only after the server actually processed it, and its status
 * says exactly what happened (read / unsupported / login required / blocked).
 * Nothing starts until the user confirms the goal-understanding screen.
 */

const EXAMPLES = [
  "Prepare tomorrow's meeting",
  "Review my unread email",
  "Watch for emails from investors",
  "Research the best option",
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
  return (
    <div className="flex animate-fade-through items-start gap-3 rounded-btn px-3 py-2.5 shadow-hairline">
      <span className="mt-px flex h-6 w-6 shrink-0 items-center justify-center text-ink-soft">
        {source.status === "login_required" ? (
          <Lock size={14} strokeWidth={1.9} />
        ) : sv.tone === "warn" ? (
          <AlertTriangle size={14} strokeWidth={1.9} />
        ) : (
          <Icon size={14} strokeWidth={1.9} />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-[0.875rem] font-semibold" title={source.name}>
            {source.name}
          </p>
          <span className={badge(sv.tone === "ok" ? "positive" : sv.tone === "warn" ? "danger" : "neutral")}>
            {IN_PROGRESS.includes(source.status) && (
              <Loader2 size={10} className="animate-spin" aria-hidden="true" />
            )}
            {sv.label}
          </span>
        </div>
        <p className="t-caption truncate">
          {source.kind === "link"
            ? source.subtype || "link"
            : [source.subtype.replace(/^application\/|^text\//, "").replace("vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"), fmtBytes(source.size_bytes)]
                .filter(Boolean)
                .join(" · ")}
          {source.injection_flag && " · flagged content (kept as data only)"}
        </p>
        {reason && <p className="t-caption mt-0.5">{reason}</p>}
      </div>
      <button
        onClick={() => onRemove(source.id)}
        aria-label={`remove ${source.name}`}
        className="mt-0.5 shrink-0 rounded-md p-1 text-ink-soft transition-colors duration-fast hover:bg-ink/[0.05] hover:text-ink"
      >
        <X size={14} strokeWidth={2} />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function SourceComposer({
  onStarted,
  suggestions,
  showSuggestions = true,
}: {
  onStarted: () => void;
  /** Contextual delegation prompts (from real connected apps); defaults to the generic set. */
  suggestions?: string[];
  /**
   * Starting points are for a blank page. Once there is real work on screen
   * they are four more things competing with it, so the page turns them off.
   */
  showSuggestions?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const backgroundActive = useBackgroundExecution();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [goal, setGoal] = useState("");

  // Cosigno Presence hands delegations here (/app?handle=…): prefill the
  // objective so the user lands mid-thought, ready to confirm.
  useEffect(() => {
    const handle = searchParams.get("handle");
    if (handle) setGoal(handle.slice(0, 2000));
  }, [searchParams]);

  /**
   * A suggestion elsewhere on the page fills this box rather than starting a
   * mission behind the user's back. A prompt card is an idea, not an
   * instruction — they still get to edit it, or change their mind.
   */
  useEffect(() => {
    const onCompose = (e: Event) => {
      const text = (e as CustomEvent<{ text?: string }>).detail?.text;
      if (!text) return;
      setGoal(text.slice(0, 2000));
      requestAnimationFrame(() => {
        const el = document.getElementById("cosigno-ask");
        el?.focus();
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    };
    window.addEventListener("cosigno:compose", onCompose);
    return () => window.removeEventListener("cosigno:compose", onCompose);
  }, []);
  const [sources, setSources] = useState<MissionSourceRecord[]>([]);
  // Optimistic placeholders keyed by a temp id, shown while a request is in flight.
  const [pending, setPending] = useState<MissionSourceRecord[]>([]);

  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [dragOver, setDragOver] = useState(false);
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
      // Delegation, not workflow-picking: "watch for…" becomes a standing
      // watch and "every monday…" a recurring rule — the user never chooses
      // the mechanism. Everything else compiles into a mission as before.
      const intent = classifyDelegation(g);
      if (intent.kind === "watch" || intent.kind === "automation") {
        await jsonFetch("/api/automations", {
          method: "POST",
          body: JSON.stringify({
            name: intent.name,
            command: g,
            interval_hours: intent.interval_hours,
            mode: intent.mode,
          }),
        });
        /* Both of these promise work that happens while you are away. If
           nothing runs on a schedule here, saying so at the moment of
           creation is the only honest version — the alternative is a watch
           that silently never watches. */
        toast(
          "success",
          backgroundActive === true
            ? intent.kind === "watch"
              ? "watching — cosigno will tell you when something happens."
              : "recurring rule created — cosigno will prepare it on schedule."
            : backgroundActive === false
              ? "saved — but scheduled running isn't available for this workspace yet. run it from watch, or ask an administrator to switch it on."
              : "saved — we couldn't confirm whether it will run on a schedule. check watch to run it yourself."
        );
        setGoal("");
        onStarted();
        router.push("/app/watch");
        return;
      }
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
      toast("success", "I have it — cosigno is on it.");
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

  /* ------------- the delegation agreement (I'll handle this) ------------- */
  if (preview) {
    const p = preview.plan;
    const returns = returnCondition(goal);
    return (
      <div className={`${card()} mt-8 animate-card-in p-7 sm:p-8`}>
        <p className="t-eyebrow">Here&apos;s what I understood</p>
        <p className="t-title mt-2 text-[1.0625rem]">{preview.understood.normalizedGoal}</p>

        <dl className="mt-7 flex flex-col gap-6">
          {preview.understood.willDo.length > 0 && (
            <Clause term="I'll handle">
              {preview.understood.willDo.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </Clause>
          )}

          <Clause term="I'll ask first">
            {p.approvalCheckpoints.length > 0 ? (
              p.approvalCheckpoints.map((c, i) => <li key={i}>{c}</li>)
            ) : (
              <li>{preview.understood.boundary}</li>
            )}
          </Clause>

          {returns && <Clause term="I'll return">{<li>when {returns}.</li>}</Clause>}

          {p.expectedDeliverables.length > 0 && (
            <Clause term="You'll get">
              <li>{p.expectedDeliverables.join(", ")}</li>
            </Clause>
          )}
        </dl>

        {p.unsupported.length > 0 && (
          <div className="mt-6 flex flex-col gap-1 border-l-2 border-signal pl-3.5">
            {p.unsupported.map((u, i) => (
              <p key={i} className="t-body">
                {u}
              </p>
            ))}
          </div>
        )}

        {preview.understood.informationProvided.length > 0 && (
          <p className="t-caption mt-6">
            Working from {preview.understood.informationProvided.join(" · ")}
          </p>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-2">
          {preview.blocked ? (
            <p className="t-body">This can&apos;t run as written — see the boundary above.</p>
          ) : (
            <button onClick={start} disabled={busy} className={btn("primary", "md")}>
              {busy ? "Starting…" : "Start"}
              {!busy && <ArrowRight size={15} strokeWidth={2} aria-hidden="true" />}
            </button>
          )}
          <button onClick={() => setPreview(null)} className={btn("ghost", "md")}>
            Edit
          </button>
        </div>
      </div>
    );
  }

  /* ---------------- ask box ---------------- */
  const controlBtn = btn("ghost", "sm");

  /* ---- drop zone: give cosigno context by dropping it anywhere here ---- */
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFiles(e.dataTransfer.files);
      if (!goal.trim()) setGoal("What should I do with this? ");
      return;
    }
    const uri = e.dataTransfer.getData("text/uri-list");
    if (uri) {
      setLinkOpen(true);
      setLinkUrl(uri.split("\n")[0].trim());
      return;
    }
    const text = e.dataTransfer.getData("text/plain");
    if (text) setGoal((g) => (g ? `${g} ${text}` : text).slice(0, 500));
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={`mt-8 rounded-card transition-shadow duration-base ${
        dragOver ? "shadow-[0_0_0_2px_rgb(var(--c-signal)/0.5)]" : ""
      }`}
    >
      {dragOver && (
        <p className="t-caption mb-3 text-center">Drop it — cosigno will read it.</p>
      )}
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <input
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && review()}
          maxLength={500}
          id="cosigno-ask"
          placeholder="Describe the outcome you want…"
          aria-label="what do you need handled"
          className={field("lg")}
        />
        <button
          onClick={review}
          disabled={busy || !goal.trim()}
          className={btn("primary", "lg", "shrink-0")}
        >
          {busy ? "Reading…" : "Delegate"}
        </button>
      </div>

      {/* control row */}
      <div className="-ml-3 mt-2.5 flex flex-wrap items-center gap-1">
        <input ref={fileRef} type="file" accept={ACCEPT} multiple hidden onChange={(e) => onFiles(e.target.files)} />
        <button onClick={() => fileRef.current?.click()} className={controlBtn}>
          <Paperclip size={14} strokeWidth={1.9} /> File
        </button>
        <button onClick={() => setLinkOpen((v) => !v)} className={controlBtn} aria-expanded={linkOpen}>
          <Link2 size={14} strokeWidth={1.9} /> Link
        </button>
        <button onClick={() => router.push("/app/connections")} className={controlBtn}>
          <Plug size={14} strokeWidth={1.9} /> Apps
        </button>
        {anyWorking && (
          <span className="t-caption ml-2 inline-flex items-center gap-1.5">
            <Loader2 size={11} className="animate-spin" aria-hidden="true" /> reading your files…
          </span>
        )}
      </div>

      {/* compact link field */}
      {linkOpen && (
        <div className="mt-3 flex animate-fade-through flex-col gap-2 sm:flex-row sm:items-center">
          <input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addLink()}
            maxLength={2048}
            placeholder="https://…"
            aria-label="paste a link"
            className={field("md")}
          />
          <div className="flex shrink-0 gap-1.5">
            <button onClick={addLink} disabled={addingLink || !linkUrl.trim()} className={btn("secondary", "md")}>
              {addingLink ? "Adding…" : "Add"}
            </button>
            <button
              onClick={() => {
                setLinkOpen(false);
                setLinkUrl("");
              }}
              className={btn("ghost", "md")}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* staged sources */}
      {all.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          {all.map((s) => (
            <SourceRow key={s.id} source={s} onRemove={removeSource} />
          ))}
        </div>
      )}

      {/* Starting points — a blank page is harder than a bad first draft. They
          disappear the moment there is real work to look at instead. */}
      {showSuggestions && (
        <div className="mt-7">
          <p className="t-eyebrow">Try</p>
          <div className="-ml-2 mt-1.5 flex flex-col items-start">
            {(suggestions ?? EXAMPLES).map((ex) => (
              <button
                key={ex}
                onClick={() => setGoal(ex)}
                className="group flex items-center gap-2 rounded-btn px-2 py-1.5 text-[0.9375rem] text-ink-soft transition-colors duration-fast hover:text-ink"
              >
                <ArrowRight
                  size={13}
                  strokeWidth={2}
                  aria-hidden="true"
                  className="-translate-x-1 opacity-0 transition-all duration-base ease-brand-out group-hover:translate-x-0 group-hover:opacity-100"
                />
                <span className="-ml-[21px] transition-transform duration-base ease-brand-out group-hover:translate-x-[21px]">
                  {ex}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * One line of the agreement: what cosigno commits to, and what it will stop
 * for. A term and its items, so the promise reads as a sentence rather than as
 * three bulleted boxes stacked on each other.
 */
function Clause({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="sm:flex sm:gap-6">
      <dt className="t-eyebrow shrink-0 pt-1 sm:w-28">{term}</dt>
      <dd className="mt-1.5 min-w-0 flex-1 sm:mt-0">
        <ul className="t-body flex flex-col gap-1.5">{children}</ul>
      </dd>
    </div>
  );
}
