"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Camera,
  FileText,
  Film,
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
import { classifyDelegation, returnCondition } from "@/lib/delegate";
import { useToast } from "@/components/Toast";
import { useBackgroundExecution } from "./useBackgroundExecution";
import { CameraCapture } from "./CameraCapture";
import { AnswerCard, type AnswerResult } from "./AnswerCard";
import {
  cameraSupported,
  extractVideoFrames,
  isImageFile,
  isVideoFile,
  prefersNativeCamera,
  prepareImageForUpload,
} from "@/lib/client/media";

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
  "watch for emails from investors",
  "research the best option",
];

const ACCEPT =
  ".pdf,.docx,.txt,.md,.markdown,.csv,.png,.jpg,.jpeg,.webp,.gif,.mp4,.mov,.m4v,.webm";

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
      // "Ready" said nothing about whether the thing was actually readable.
      // These labels are a promise about what the operator will see.
      if (s.kind === "link") return { label: "Read", tone: "ok" };
      if (s.kind === "video") {
        const n = typeof s.detail?.frames === "number" ? s.detail.frames : 0;
        return { label: n > 0 ? `${n} frames read` : "Read", tone: "ok" };
      }
      if (s.subtype.startsWith("image/")) return { label: "Image read", tone: "ok" };
      return { label: "Read", tone: "ok" };
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
  const Icon =
    source.kind === "link" ? Link2 : source.kind === "video" ? Film : isImage ? ImageIcon : FileText;
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

  /** A question about attached material is answered here, not delegated. */
  const [answer, setAnswer] = useState<{ question: string; result: AnswerResult } | null>(null);
  const [savingAnswer, setSavingAnswer] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const cameraRef = useRef<HTMLInputElement | null>(null);

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

  /**
   * Camera availability is a property of the device, which the server can't
   * know. Detecting it after mount keeps the server and client markup
   * identical and avoids a hydration mismatch.
   */
  const [canUseCamera, setCanUseCamera] = useState(false);
  const [nativeCamera, setNativeCamera] = useState(false);
  useEffect(() => {
    setCanUseCamera(cameraSupported());
    setNativeCamera(prefersNativeCamera());
  }, []);

  /* ---- file / photo / video upload ---- */
  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      const video = isVideoFile(file);
      const tempId = `tmp-${Math.random().toString(36).slice(2)}`;
      const placeholder: MissionSourceRecord = {
        id: tempId,
        user_id: "",
        mission_id: null,
        kind: video ? "video" : "file",
        name: file.name,
        subtype: file.type || "",
        size_bytes: file.size,
        status: video ? "processing" : "uploading",
        summary: "",
        media: [],
        injection_flag: false,
        detail: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setPending((p) => [...p, placeholder]);
      try {
        const source = video ? await uploadVideo(file) : await uploadFile(file);
        setPending((p) => p.filter((x) => x.id !== tempId));
        setSources((s) => [...s, source]);
      } catch (e) {
        setPending((p) => p.filter((x) => x.id !== tempId));
        toast("error", e instanceof Error ? e.message : "that file couldn't be added.");
      }
    }
    if (fileRef.current) fileRef.current.value = "";
    if (cameraRef.current) cameraRef.current.value = "";
  }

  /**
   * A phone photo is 12 MP and several megabytes. Resizing it here is what
   * keeps "snap it and ask" from failing at the size limit on cellular.
   */
  async function uploadFile(file: File): Promise<MissionSourceRecord> {
    const prepared = isImageFile(file) ? await prepareImageForUpload(file) : file;
    const form = new FormData();
    form.append("file", prepared);
    const res = await fetch("/api/sources/file", { method: "POST", body: form });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || "that file couldn't be uploaded.");
    return body.source as MissionSourceRecord;
  }

  /**
   * The video never leaves this device. Frames are decoded here and only the
   * frames are uploaded — which is why a two-minute clip attaches in seconds
   * and isn't refused for being too big.
   */
  async function uploadVideo(file: File): Promise<MissionSourceRecord> {
    const { frames, timestamps, duration, width, height } = await extractVideoFrames(file);
    const form = new FormData();
    form.append("name", file.name);
    form.append("mime", file.type || "video/mp4");
    form.append("duration", String(duration));
    form.append("width", String(width));
    form.append("height", String(height));
    form.append("size_bytes", String(file.size));
    frames.forEach((blob, i) => {
      form.append("frames", blob, `frame-${i}.jpg`);
      form.append("timestamps", String(timestamps[i] ?? 0));
    });
    const res = await fetch("/api/sources/video", { method: "POST", body: form });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || "that video couldn't be read.");
    return body.source as MissionSourceRecord;
  }

  /** A capture from the laptop camera behaves exactly like any other upload. */
  async function onCameraCapture(file: File) {
    setCameraOpen(false);
    const list = new DataTransfer();
    list.items.add(file);
    await onFiles(list.files);
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
        media: [],
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
      const intent = classifyDelegation(g, { hasAttachments: sources.length > 0 });

      // A question about material in hand is answered now. It used to be
      // compiled into a research mission, which is how "give me a detailed
      // report on this photo" came back as web research about a picture
      // nobody had opened.
      if (intent.kind === "read") {
        const data = await jsonFetch("/api/analyze", {
          method: "POST",
          body: JSON.stringify({ question: g, sourceIds: sources.map((s) => s.id) }),
        });
        setAnswer({ question: g, result: data as AnswerResult });
        return;
      }

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

  /**
   * Keep an answer as a real document. It is saved into Files (so it has a
   * home and a version) and the requested format is downloaded — the PDF is
   * rendered from the saved text, so the file on disk and the file in cosigno
   * can never disagree.
   */
  async function saveAnswer(format: "md" | "pdf") {
    if (!answer || savingAnswer) return;
    setSavingAnswer(true);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      const title = answer.question.replace(/[\n\r]/g, " ").trim().slice(0, 60) || "Answer";
      const body =
        `# ${title}\n\n${answer.result.answer}\n` +
        (answer.result.looked_at.length > 0 ? `\nRead: ${answer.result.looked_at.join(", ")}\n` : "") +
        (answer.result.could_not_read.length > 0
          ? `\nNot read: ${answer.result.could_not_read.join("; ")}\n`
          : "");

      const saved = await jsonFetch("/api/files", {
        method: "POST",
        body: JSON.stringify({ name: `${title} (${stamp})`, mime: "text/markdown", content: body }),
      });
      const file = saved.file as { id: string; name: string };

      if (format === "pdf") {
        const res = await fetch(`/api/files/${file.id}/export?format=pdf`);
        if (!res.ok) throw new Error("the PDF couldn't be created.");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${title}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      }
      // Say WHERE it went. A saved file the user can't find is a lost file.
      toast("success", `saved to Files as "${file.name}" — open Files to edit or re-download it.`);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "that couldn't be saved.");
    } finally {
      setSavingAnswer(false);
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

  /* ---------------------------- the answer ---------------------------- */
  if (answer) {
    return (
      <AnswerCard
        question={answer.question}
        result={answer.result}
        saving={savingAnswer}
        onSave={saveAnswer}
        onAskAgain={() => {
          setAnswer(null);
          setGoal("");
        }}
      />
    );
  }

  /* ------------- the delegation agreement (I'll handle this) ------------- */
  if (preview) {
    const p = preview.plan;
    const returns = returnCondition(goal);
    return (
      <div className="mt-5 flex flex-col gap-4 rounded-card border border-line/70 bg-cream/40 p-5">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-widest text-ink-soft">
            I&apos;ll handle this.
          </p>
          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-ink-soft/70">Objective</p>
          <p className="mt-1 text-base font-extrabold">{preview.understood.normalizedGoal}</p>
        </div>

        {preview.understood.willDo.length > 0 && (
          <div>
            <p className="text-xs font-extrabold uppercase tracking-widest text-ink-soft">I&apos;ll handle</p>
            <ul className="mt-1.5 flex flex-col gap-1 text-sm">
              {preview.understood.willDo.map((w, i) => (
                <li key={i} className="flex gap-2 font-semibold">
                  <span className="text-ink-soft">•</span>
                  {w}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <p className="text-xs font-extrabold uppercase tracking-widest text-ink-soft">I&apos;ll ask before</p>
          {p.approvalCheckpoints.length > 0 ? (
            <ul className="mt-1.5 flex flex-col gap-1 text-sm">
              {p.approvalCheckpoints.map((c, i) => (
                <li key={i} className="flex gap-2 font-semibold">
                  <span className="text-ink-soft">•</span>
                  {c}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 text-sm font-semibold">{preview.understood.boundary}</p>
          )}
          {p.unsupported.length > 0 && (
            <div className="mt-2 flex flex-col gap-1 rounded-btn bg-signal/10 px-3 py-2 text-sm font-semibold ring-1 ring-inset ring-signal/30">
              {p.unsupported.map((u, i) => (
                <p key={i}>• {u}</p>
              ))}
            </div>
          )}
        </div>

        {returns && (
          <p className="text-sm font-semibold">
            <span className="text-xs font-extrabold uppercase tracking-widest text-ink-soft">
              I&apos;ll return{" "}
            </span>
            when {returns}.
          </p>
        )}

        {preview.understood.informationProvided.length > 0 && (
          <p className="text-xs text-ink-soft">
            Working from: {preview.understood.informationProvided.join(" · ")}
          </p>
        )}

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
              className="inline-flex items-center gap-1.5 rounded-btn bg-signal px-5 py-2.5 text-sm font-extrabold text-ink shadow-soft transition-transform active:scale-95 disabled:bg-cream-deep disabled:text-ink-soft disabled:shadow-none disabled:cursor-not-allowed"
            >
              <Sparkles size={15} /> {busy ? "Delegating…" : "Delegate →"}
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
      className={dragOver ? "rounded-card ring-2 ring-signal/60" : undefined}
    >
      {cameraOpen && <CameraCapture onCapture={onCameraCapture} onClose={() => setCameraOpen(false)} />}
      {dragOver && (
        <p className="mt-3 rounded-btn bg-signal/10 px-3 py-2 text-center text-xs font-extrabold text-ink">
          Drop it — cosigno will take it from here.
        </p>
      )}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <input
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && review()}
          maxLength={500}
          id="cosigno-ask"
          placeholder="Ask cosigno anything…"
          aria-label="what do you need handled"
          className="w-full rounded-btn border border-line/70 bg-cream/40 px-4 py-3.5 text-base font-semibold shadow-well placeholder:font-medium placeholder:text-ink-soft/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
        />
        <button
          onClick={review}
          disabled={busy || !goal.trim()}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-btn bg-signal px-6 py-3.5 text-base font-extrabold text-ink shadow-soft transition-transform active:scale-95 disabled:bg-cream-deep disabled:text-ink-soft disabled:shadow-none disabled:cursor-not-allowed"
        >
          <Sparkles size={16} /> {busy ? "Reading…" : "Delegate"}
        </button>
      </div>

      {/* control row */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input ref={fileRef} type="file" accept={ACCEPT} multiple hidden onChange={(e) => onFiles(e.target.files)} />
        <button onClick={() => fileRef.current?.click()} className={controlBtn}>
          <Paperclip size={14} /> Add file
        </button>
        {/*
          Take a photo. On a phone, `capture` hands off to the OS camera app,
          which focuses and exposes far better than anything in a web page; on
          a laptop we open a live preview instead. Either way it is one tap
          from "point at the thing" to "ask about the thing".
        */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => onFiles(e.target.files)}
        />
        {(nativeCamera || canUseCamera) && (
          <button
            onClick={() => (nativeCamera ? cameraRef.current?.click() : setCameraOpen(true))}
            className={controlBtn}
          >
            <Camera size={14} /> Take photo
          </button>
        )}
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
              className="rounded-btn bg-ink px-4 py-2 text-sm font-bold text-cream disabled:bg-cream-deep disabled:text-ink-soft disabled:shadow-none disabled:cursor-not-allowed"
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
