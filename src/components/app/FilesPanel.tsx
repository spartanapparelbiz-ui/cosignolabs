"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, FileText, Plus, Trash2 } from "lucide-react";
import type { FileRecord } from "@/lib/types";
import { useToast } from "@/components/Toast";

/**
 * Files — text deliverables and documents that live inside cosigno. Create,
 * open, edit (each save bumps the version), download, delete. Text-only v1
 * (plain / markdown / csv); binary uploads are a later phase and are not
 * pretended here. Full loading / error / empty states.
 */

const MIME_LABEL: Record<FileRecord["mime"], string> = {
  "text/plain": "text",
  "text/markdown": "markdown",
  "text/csv": "csv",
};

const MIME_EXT: Record<FileRecord["mime"], string> = {
  "text/plain": ".txt",
  "text/markdown": ".md",
  "text/csv": ".csv",
};

async function jsonFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || body.error || "something went wrong.");
  return body;
}

function download(file: FileRecord) {
  const blob = new Blob([file.content], { type: file.mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const ext = MIME_EXT[file.mime];
  a.download = file.name.endsWith(ext) ? file.name : `${file.name}${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}

export function FilesPanel() {
  const [files, setFiles] = useState<FileRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftMime, setDraftMime] = useState<FileRecord["mime"]>("text/markdown");
  const [open, setOpen] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const toast = useToast();

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await jsonFetch("/api/files");
      setFiles(data.files ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "couldn't load your files.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    if (!draftName.trim()) return;
    setBusy("create");
    try {
      const data = await jsonFetch("/api/files", {
        method: "POST",
        body: JSON.stringify({ name: draftName.trim(), mime: draftMime, content: "" }),
      });
      setCreating(false);
      setDraftName("");
      toast("success", "file created.");
      await load();
      setOpen(data.file?.id ?? null);
      setEditText("");
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "couldn't create that file.");
    } finally {
      setBusy(null);
    }
  }

  async function save(file: FileRecord) {
    setBusy(file.id);
    try {
      await jsonFetch(`/api/files/${file.id}`, {
        method: "PATCH",
        body: JSON.stringify({ content: editText }),
      });
      toast("success", `saved — now v${file.version + 1}.`);
      setOpen(null);
      await load();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "couldn't save that.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(file: FileRecord) {
    setBusy(file.id);
    try {
      await jsonFetch(`/api/files/${file.id}`, { method: "DELETE" });
      toast("success", "deleted.");
      if (open === file.id) setOpen(null);
      await load();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "couldn't delete that.");
    } finally {
      setBusy(null);
    }
  }

  if (error) {
    return (
      <div className="rounded-card bg-surface/60 p-6 text-center shadow-soft">
        <p className="text-sm font-semibold text-ink-soft">{error}</p>
        <button onClick={load} className="mt-3 rounded-btn px-4 py-2 text-sm font-bold lowercase ring-1 ring-inset ring-ink hover:bg-cream-deep">
          try again
        </button>
      </div>
    );
  }

  if (files === null) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="loading files">
        {[0, 1].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-card bg-cream-deep" />
        ))}
      </div>
    );
  }

  const inputCls =
    "w-full rounded-btn bg-surface px-3 py-2.5 text-sm shadow-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal";

  return (
    <div className="flex flex-col gap-4">
      {/* create */}
      {creating ? (
        <div className="flex flex-col gap-2 rounded-card bg-surface/60 p-4 shadow-soft">
          <input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            maxLength={120}
            placeholder="file name (e.g. launch-checklist)"
            className={inputCls}
            aria-label="file name"
            autoFocus
          />
          <div className="flex flex-wrap items-center gap-2">
            {(Object.keys(MIME_LABEL) as FileRecord["mime"][]).map((m) => (
              <button
                key={m}
                onClick={() => setDraftMime(m)}
                aria-pressed={draftMime === m}
                className={`min-h-[32px] rounded-pill px-3 py-1 text-[11px] font-bold lowercase ring-1 ring-inset ${
                  draftMime === m ? "bg-ink text-cream ring-ink" : "ring-ink/30 hover:bg-cream-deep"
                }`}
              >
                {MIME_LABEL[m]}
              </button>
            ))}
            <div className="ml-auto flex gap-2">
              <button
                onClick={create}
                disabled={busy === "create" || !draftName.trim()}
                className="rounded-btn bg-signal px-4 py-1.5 text-xs font-extrabold text-ink disabled:opacity-40"
              >
                create
              </button>
              <button onClick={() => setCreating(false)} className="rounded-btn px-4 py-1.5 text-xs font-bold lowercase ring-1 ring-inset ring-ink hover:bg-cream-deep">
                cancel
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="inline-flex w-fit items-center gap-1.5 rounded-btn bg-ink px-3.5 py-2 text-xs font-bold text-cream"
        >
          <Plus size={13} /> new file
        </button>
      )}

      {files.length === 0 && !creating && (
        <div className="flex flex-col items-center gap-2 rounded-card bg-surface/40 px-6 py-10 text-center shadow-soft">
          <p className="text-sm font-extrabold lowercase">no files yet.</p>
          <p className="max-w-sm text-xs text-ink-soft">
            files hold the documents your missions produce — notes, drafts,
            checklists, csv exports. text files only for now.
          </p>
        </div>
      )}

      {files.map((f) => (
        <div key={f.id} className="rounded-card bg-surface/60 p-4 shadow-soft">
          <div className="flex items-start gap-3">
            <FileText size={16} className="mt-0.5 shrink-0 text-ink-soft" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-extrabold">{f.name}</p>
              <p className="text-[11px] text-ink-soft">
                {MIME_LABEL[f.mime]} · v{f.version} · {f.content.length.toLocaleString()} chars ·{" "}
                {new Date(f.updated_at).toLocaleDateString()}
              </p>
            </div>
            <button
              onClick={() => download(f)}
              className="inline-flex min-h-[32px] shrink-0 items-center gap-1 rounded-pill px-3 py-1 text-[11px] font-bold lowercase text-ink-soft hover:bg-cream-deep"
            >
              <Download size={11} /> download
            </button>
          </div>

          {open === f.id ? (
            <div className="mt-3 flex flex-col gap-2">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                maxLength={80000}
                rows={10}
                className={`${inputCls} font-mono text-xs`}
                aria-label={`edit ${f.name}`}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => save(f)}
                  disabled={busy === f.id}
                  className="rounded-btn bg-signal px-4 py-1.5 text-xs font-extrabold text-ink disabled:opacity-40"
                >
                  save (v{f.version + 1})
                </button>
                <button onClick={() => setOpen(null)} className="rounded-btn px-4 py-1.5 text-xs font-bold lowercase ring-1 ring-inset ring-ink hover:bg-cream-deep">
                  close
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  setOpen(f.id);
                  setEditText(f.content);
                }}
                className="min-h-[32px] rounded-pill px-3 py-1 text-[11px] font-bold lowercase ring-1 ring-inset ring-ink/30 hover:bg-cream-deep"
              >
                open
              </button>
              <button
                onClick={() => remove(f)}
                disabled={busy === f.id}
                className="ml-auto inline-flex min-h-[32px] items-center gap-1 rounded-pill px-3 py-1 text-[11px] font-bold lowercase text-ink-soft hover:bg-cream-deep"
              >
                <Trash2 size={11} /> delete
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
