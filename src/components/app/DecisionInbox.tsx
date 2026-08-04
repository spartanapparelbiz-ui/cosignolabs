"use client";

import { useCallback, useEffect, useState } from "react";
import type { ActionPreview, ActionRecord, SignatureRecord } from "@/lib/types";
import { ActionCard, type ApproveOpts } from "@/components/ActionCard";
import { SkeletonCard } from "@/components/Skeleton";
import { EmptyIllustration } from "@/components/EmptyIllustration";
import { useToast } from "@/components/Toast";
import { useDisplayName } from "@/lib/theme";

/**
 * The Decision Inbox — ONLY items that need human judgment: every proposed
 * action across every mission, in one queue. Approve / edit / veto run through
 * the exact same endpoints and state machine as the workspace; resolved cards
 * leave the queue on the next refresh. Full loading / error / empty states.
 */

async function jsonFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || body.error || "something went wrong.");
  return body;
}

/**
 * An action plus what the Workspace Model says about it. The preview is
 * optional everywhere: it explains, it never gates, so a card renders exactly
 * as before when the model has nothing to say.
 */
export type ActionWithPreview = ActionRecord & { preview?: ActionPreview };

export function DecisionInbox({ initial }: { initial?: ActionWithPreview[] }) {
  // When the server prefetched the queue it renders on first paint; the
  // mount load() below then revalidates in the background (SWR).
  const [actions, setActions] = useState<ActionWithPreview[] | null>(initial ?? null);
  const [saved, setSaved] = useState<SignatureRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [displayName] = useDisplayName();
  const toast = useToast();

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await jsonFetch("/api/actions?status=proposed&limit=200");
      setActions(data.actions ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "couldn't load your decisions.");
    }
  }, []);

  useEffect(() => {
    load();
    // The saved signature enables Hold to Sign — best effort, never blocking.
    jsonFetch("/api/signature")
      .then((d) => setSaved(d.signature ?? null))
      .catch(() => null);
  }, [load]);

  const onApprove = useCallback(
    async (id: string, opts: ApproveOpts): Promise<string | null> => {
      try {
        await jsonFetch(`/api/actions/${id}/approve`, {
          method: "POST",
          body: JSON.stringify({
            ...(opts.confirmation ? { confirmation: opts.confirmation } : {}),
            ...(opts.signature ? { signature: opts.signature } : {}),
          }),
        });
        toast("success", opts.signature ? "signed & executed." : "approved & executed.");
        await load();
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : "that didn't go through.";
      }
    },
    [load, toast]
  );

  const onSaveSignature = useCallback(
    async (name: string, image: string) => {
      try {
        const d = await jsonFetch("/api/signature", {
          method: "PUT",
          body: JSON.stringify({ name, image }),
        });
        setSaved(d.signature ?? null);
        toast("success", "signature saved — next time, hold to sign.");
      } catch {
        // Convenience only; the approval already went through.
      }
    },
    [toast]
  );

  const onVeto = useCallback(
    async (id: string, reason: string): Promise<string | null> => {
      try {
        await jsonFetch(`/api/actions/${id}/veto`, {
          method: "POST",
          body: JSON.stringify({ reason }),
        });
        toast("success", "vetoed — nothing ran.");
        await load();
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : "that didn't go through.";
      }
    },
    [load, toast]
  );

  const onEdit = useCallback(
    async (id: string, payload: Record<string, unknown>): Promise<string | null> => {
      try {
        await jsonFetch(`/api/actions/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ payload }),
        });
        await load();
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : "couldn't save that edit.";
      }
    },
    [load]
  );

  if (error) {
    return (
      <div className="rounded-card bg-surface/60 p-6 text-center shadow-soft">
        <p className="text-sm font-semibold text-ink-soft">{error}</p>
        <button
          onClick={load}
          className="mt-3 rounded-btn px-4 py-2 text-sm font-bold lowercase ring-1 ring-inset ring-ink hover:bg-cream-deep"
        >
          try again
        </button>
      </div>
    );
  }

  if (actions === null) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="loading decisions">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (actions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-card bg-surface/40 px-6 py-12 text-center shadow-soft">
        <EmptyIllustration kind="workspace" />
        <p className="text-sm font-extrabold lowercase">nothing needs your decision.</p>
        <p className="max-w-sm text-xs text-ink-soft">
          when the operator prepares an action that needs your sign-off, it
          lands here — and nothing moves until you decide.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-bold lowercase tracking-wide text-ink-soft" role="status">
        {actions.length} decision{actions.length === 1 ? "" : "s"} waiting — nothing
        has been taken without you.
      </p>
      {actions.map((a, i) => (
        <ActionCard
          key={a.id}
          action={a}
          preview={a.preview}
          index={i}
          savedSignature={saved}
          signerName={displayName.trim() || "Operator"}
          onSaveSignature={onSaveSignature}
          onApprove={onApprove}
          onVeto={onVeto}
          onEdit={onEdit}
        />
      ))}
    </div>
  );
}
