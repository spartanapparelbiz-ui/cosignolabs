"use client";

import { useCallback, useEffect, useState } from "react";
import type { ActionRecord, SignatureRecord } from "@/lib/types";
import { ActionCard, type ApproveOpts } from "@/components/ActionCard";
import { SkeletonCard } from "@/components/Skeleton";
import { EmptyIllustration } from "@/components/EmptyIllustration";
import { useToast } from "@/components/Toast";
import { useDisplayName } from "@/lib/theme";
import { EmptyState } from "@/components/ui/Page";
import { btn } from "@/components/ui/styles";

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

export function DecisionInbox({
  initial,
  only,
  compact = false,
  emptyFallback,
}: {
  initial?: ActionRecord[];
  /**
   * Restrict the queue to these action ids. Used when the inbox is embedded
   * beside work it belongs to — a mission shows only ITS decisions, so
   * approving there can't silently sign off an unrelated card.
   */
  only?: string[];
  /** Drop the standing-queue header when embedded as a section of a page. */
  compact?: boolean;
  /** What to render instead of the full-page empty state when embedded. */
  emptyFallback?: React.ReactNode;
}) {
  // When the server prefetched the queue it renders on first paint; the
  // mount load() below then revalidates in the background (SWR).
  const [actions, setActions] = useState<ActionRecord[] | null>(initial ?? null);
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
      <EmptyState
        title="That didn't load"
        description={error}
        action={
          <button onClick={load} className={btn("secondary", "md")}>
            Try again
          </button>
        }
      />
    );
  }

  if (actions === null) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="loading decisions">
        <SkeletonCard />
        {!compact && <SkeletonCard />}
      </div>
    );
  }

  // Scoping happens at RENDER, not in the fetch: the queue is still the one
  // shared list, so approving from an embedded copy and from the approvals
  // page cannot drift apart. An embedded inbox simply shows less of it.
  const visible = only ? actions.filter((a) => only.includes(a.id)) : actions;

  if (visible.length === 0) {
    if (emptyFallback !== undefined) return <>{emptyFallback}</>;
    return (
      <EmptyState
        illustration={<EmptyIllustration kind="workspace" />}
        title="Nothing needs you"
        description="When cosigno prepares something that requires your signature, it lands here. Nothing moves until you decide."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {!compact && (
        <p className="t-caption" role="status">
          {visible.length} waiting. Nothing has been done without you.
        </p>
      )}
      {visible.map((a, i) => (
        <ActionCard
          key={a.id}
          action={a}
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
