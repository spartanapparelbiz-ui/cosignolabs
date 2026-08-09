"use client";

import { useCallback } from "react";
import type { ActionRecord, SignatureRecord } from "@/lib/types";
import { ActionCard, type ApproveOpts } from "@/components/ActionCard";
import { SkeletonCard } from "@/components/Skeleton";
import {
  invalidate,
  readResource,
  seedResource,
  setResource,
  useResource,
} from "@/lib/client/resource";
import { PENDING_APPROVALS_KEY } from "@/lib/client/keys";
import { EmptyState } from "@/components/EmptyState";
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
  // The server's prefetch goes straight into the shared cache, so the queue is
  // on screen at first paint and the client asks for nothing it already has.
  // The rail's badge reads the very same entry — one request, one truth.
  if (initial) seedResource(PENDING_APPROVALS_KEY, { actions: initial });
  const queue = useResource<{ actions?: ActionRecord[] }>(PENDING_APPROVALS_KEY, {
    refreshMs: 30_000,
  });
  const signature = useResource<{ signature?: SignatureRecord | null }>("/api/signature");

  // Server render and hydration render both fall through to `initial`; see
  // the note in Dashboard and in lib/client/resource.ts.
  const actions = queue.data?.actions ?? initial ?? (queue.loading ? null : []);
  const saved = signature.data?.signature ?? null;
  const error = queue.error ?? null;
  const [displayName] = useDisplayName();
  const toast = useToast();

  /**
   * A resolved decision leaves the queue on the same frame as the confirmation
   * — the server has already told us it landed, so waiting for a refetch just
   * to remove a card is a round trip the person watches for no reason. The
   * refetch still runs behind it and reconciles anything else that changed.
   *
   * Every surface reading the queue moves together: the rail badge drops, home
   * updates, and this list shortens, because they are one cache entry.
   */
  const resolved = useCallback((id: string) => {
    const current = readResource<{ actions?: ActionRecord[] }>(PENDING_APPROVALS_KEY);
    if (current?.actions) {
      setResource(PENDING_APPROVALS_KEY, {
        actions: current.actions.filter((a) => a.id !== id),
      });
    }
    invalidate("/api/actions");
  }, []);

  /** Re-read the queue without assuming what changed (edits, errors). */
  const load = useCallback(async () => {
    invalidate("/api/actions");
  }, []);

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
        resolved(id);
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : "that didn't go through.";
      }
    },
    [resolved, toast]
  );

  const onSaveSignature = useCallback(
    async (name: string, image: string) => {
      try {
        const d = await jsonFetch("/api/signature", {
          method: "PUT",
          body: JSON.stringify({ name, image }),
        });
        setResource("/api/signature", { signature: d.signature ?? null });
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
        resolved(id);
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : "that didn't go through.";
      }
    },
    [resolved, toast]
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
          onClick={queue.refresh}
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
        kind="handled"
        title="Everything waiting on you has been handled."
        body="When cosigno prepares an action that needs your signature, it lands here — and nothing moves until you decide."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {!compact && (
        <p className="text-xs font-bold lowercase tracking-wide text-ink-soft" role="status">
          {visible.length} decision{visible.length === 1 ? "" : "s"} waiting — nothing
          has been taken without you.
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
