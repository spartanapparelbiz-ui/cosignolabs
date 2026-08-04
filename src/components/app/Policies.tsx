"use client";

import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { PermissionRules } from "@/components/account/PermissionRules";
import { capabilitySentence } from "@/lib/clarity";
import { requiredApproval } from "@/lib/risk";
import type { ActionCategory, CategoryMeta, Tier } from "@/lib/types";

/**
 * Policies — "what rules protect my business?"
 *
 * One question, one page. Every kind of thing AI can do is a sentence with a
 * requirement next to it, and changing a requirement is two buttons — not a
 * tier, not a column, not a boolean matrix. The user never sees the word
 * "tier" and never sees code.
 *
 * The rules themselves are unchanged: the server owns every floor, locked
 * categories cannot be moved from here (or anywhere), and the plain-language
 * custom rules below can only ever tighten what cosigno may do.
 */

type CategoryWithTier = CategoryMeta & { tier: Tier };

/** The requirement, phrased for a human, with the button that would set it. */
const CHOICES: { tier: Tier; label: string; hint: string }[] = [
  { tier: 1, label: "run automatically", hint: "no approval — cosigno just does it" },
  { tier: 2, label: "ask me first", hint: "waits for your approval every time" },
];

export function Policies() {
  const [categories, setCategories] = useState<CategoryWithTier[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/settings/tiers", { cache: "no-store" });
      if (!res.ok) throw new Error("couldn't load your policies.");
      const data = await res.json();
      setCategories(data.categories ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "couldn't load your policies.");
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function move(category: ActionCategory, tier: Tier) {
    setMessage(null);
    const before = categories;
    setCategories((cs) => cs?.map((c) => (c.category === category ? { ...c, tier } : c)) ?? null);
    const res = await fetch("/api/settings/tiers", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, tier }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setMessage(body.message ?? "that change didn't save — nothing was altered.");
      setCategories(before ?? null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <header>
        <h1 className="font-display text-3xl font-bold lowercase tracking-tight">policies</h1>
        <p className="mt-2 text-base font-semibold text-ink-soft">
          What rules protect your business. Every kind of action AI can take, and what it has to do
          before taking it.
        </p>
      </header>

      {error && (
        <div className="mt-8 rounded-card border border-line bg-surface p-5">
          <p className="text-sm font-semibold">{error}</p>
          <button
            onClick={load}
            className="mt-3 rounded-btn bg-ink px-4 py-1.5 text-sm font-bold lowercase text-cream"
          >
            retry
          </button>
        </div>
      )}

      {message && (
        <p className="mt-6 rounded-btn bg-cream-deep px-3 py-2 text-sm font-semibold" role="alert">
          {message}
        </p>
      )}

      <section className="mt-8">
        <ul className="flex flex-col gap-2">
          {categories === null && !error
            ? [0, 1, 2, 3].map((i) => (
                <li key={i} className="h-20 animate-pulse rounded-card border border-line bg-surface" aria-hidden="true" />
              ))
            : categories?.map((c) => (
                <li
                  key={c.category}
                  className="rounded-card border border-line bg-surface px-5 py-4 shadow-soft"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-base font-bold">
                        cosigno can {capabilitySentence(c.category)}
                      </p>
                      <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-ink-soft">
                        {c.pinned && <Lock size={12} strokeWidth={2.6} aria-hidden="true" />}
                        {requirementSentence(c)}
                      </p>
                    </div>

                    {c.pinned ? (
                      <span className="rounded-pill bg-ink px-3 py-1 text-[10px] font-black uppercase tracking-wider text-cream">
                        locked
                      </span>
                    ) : (
                      <div className="flex gap-1.5">
                        {CHOICES.map((choice) => {
                          const active = c.tier === choice.tier;
                          return (
                            <button
                              key={choice.tier}
                              onClick={() => !active && move(c.category, choice.tier)}
                              aria-pressed={active}
                              title={choice.hint}
                              className={`rounded-pill px-3 py-1.5 text-xs font-bold transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal ${
                                active
                                  ? "bg-ink text-cream"
                                  : "bg-cream-deep text-ink-soft hover:text-ink"
                              }`}
                            >
                              {choice.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </li>
              ))}
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-ink-soft">
          Locked actions — deleting data, refunds, payments — always need your signature. Neither you
          nor an AI can lower them, here or anywhere else.
        </p>
      </section>

      <hr className="my-10 border-line" />

      <PermissionRules />
    </div>
  );
}

/** "Needs your signature." / "Runs automatically." — never a tier number. */
function requirementSentence(c: CategoryWithTier): string {
  const requirement = requiredApproval({ category: c.category, tier: c.tier });
  if (requirement.startsWith("none")) return "Runs automatically — nothing to approve.";
  if (requirement === "your signature") return "Needs your signature every time.";
  return "Needs your approval every time.";
}
