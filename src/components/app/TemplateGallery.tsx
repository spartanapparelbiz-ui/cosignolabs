"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import { useToast } from "@/components/Toast";
import {
  ALL_TEMPLATES,
  TEMPLATE_CATEGORIES,
  recommendedFor,
  searchTemplates,
  type Template,
} from "@/lib/templates/catalog";
import { card, field } from "@/components/ui/styles";

/**
 * The template gallery: what cosigno can actually do for you, browsable.
 *
 * Every card starts something real — an engine template runs turnkey, a goal
 * template starts a mission that asks for the one fact it's missing, and a
 * compose template opens the ask box with the goal prefilled so one phrase
 * finishes it. There is no card here whose backend doesn't exist.
 *
 * The featured rows are real signal only: "recently used" is your history on
 * this device, "recommended" is derived from the apps you actually connected.
 * No trending, no popularity numbers — we don't collect what they'd need.
 */

const RECENT_KEY = "cosigno.templates.recent";

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function pushRecent(key: string): void {
  try {
    const next = [key, ...readRecent().filter((k) => k !== key)].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* private mode — recents simply don't persist */
  }
}

export function TemplateGallery() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [recentKeys, setRecentKeys] = useState<string[]>([]);
  const [connectedKeys, setConnectedKeys] = useState<string[]>([]);

  useEffect(() => {
    setRecentKeys(readRecent());
    fetch("/api/connections")
      .then((r) => r.json())
      .then((d) => {
        const items = Array.isArray(d.connections) ? d.connections : [];
        setConnectedKeys(
          items
            .filter((c: { status?: string }) => c.status === "connected")
            .map((c: { provider_key?: string }) => String(c.provider_key ?? ""))
        );
      })
      .catch(() => undefined);
  }, []);

  const recent = useMemo(
    () =>
      recentKeys
        .map((k) => ALL_TEMPLATES.find((t) => t.key === k))
        .filter((t): t is Template => Boolean(t)),
    [recentKeys]
  );
  const recommended = useMemo(
    () => recommendedFor(connectedKeys).filter((t) => !recentKeys.includes(t.key)).slice(0, 4),
    [connectedKeys, recentKeys]
  );
  const matches = useMemo(() => searchTemplates(query), [query]);
  const searching = query.trim().length > 0;

  async function run(t: Template) {
    setBusy(t.key);
    pushRecent(t.key);
    try {
      if (t.run.kind === "compose") {
        // The goal needs your subject — land in the ask box mid-thought.
        router.push(`/app?handle=${encodeURIComponent(t.run.prefill)}`);
        return;
      }
      const body =
        t.run.kind === "engine" ? { template: t.run.template } : { goal: t.run.goal };
      const res = await fetch("/api/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Couldn't start the mission.");
      toast("success", "Mission started.");
      router.push(`/app/missions/${data.mission.id}`);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Couldn't start the mission.");
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-10">
      {/* search */}
      <label className="relative block">
        <Search
          size={16}
          strokeWidth={1.9}
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-soft"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="What would you like help with?"
          aria-label="search templates"
          className={`${field("lg")} pl-11`}
        />
      </label>

      {searching ? (
        <section>
          <h2 className="t-eyebrow">
            {matches.length === 0
              ? "Nothing matches"
              : `${matches.length} match${matches.length === 1 ? "" : "es"}`}
          </h2>
          {matches.length === 0 ? (
            <p className="t-body mt-3 max-w-[38rem]">
              No template covers that yet, but the ask box does. Describe it in your own
              words on{" "}
              <a href="/app" className="underline underline-offset-2">
                home
              </a>
              , and cosigno turns it into a plan you see before anything runs.
            </p>
          ) : (
            <Grid templates={matches} busy={busy} onRun={run} />
          )}
        </section>
      ) : (
        <>
          {/* featured — real signal only */}
          {recent.length > 0 && (
            <section>
              <h2 className="t-eyebrow">Recently used</h2>
              <Grid templates={recent} busy={busy} onRun={run} />
            </section>
          )}
          {recommended.length > 0 && (
            <section>
              <h2 className="t-eyebrow">Works with your connected apps</h2>
              <Grid templates={recommended} busy={busy} onRun={run} />
            </section>
          )}

          {TEMPLATE_CATEGORIES.map((cat) => (
            <section key={cat.id}>
              <h2 className="t-eyebrow">{cat.title}</h2>
              <Grid templates={cat.templates} busy={busy} onRun={run} />
            </section>
          ))}

          <p className="t-caption">
            Anything else, describe in your own words on{" "}
            <a href="/app" className="text-ink underline underline-offset-2">
              home
            </a>
            . cosigno turns an open-ended goal into a plan and shows it to you first.
          </p>
        </>
      )}
    </div>
  );
}

function Grid({
  templates,
  busy,
  onRun,
}: {
  templates: Template[];
  busy: string | null;
  onRun: (t: Template) => void;
}) {
  return (
    <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
      {templates.map((t) => (
        <Card key={t.key} template={t} busy={busy} onRun={onRun} />
      ))}
    </div>
  );
}

/**
 * The card: title, one sentence, the apps it touches, and what it does about
 * approval. No emoji tile — twenty-five of those on one page is a sticker
 * album, and none of them said anything the title didn't. No estimated
 * minutes either: that would be a duration we invented. What the card promises
 * is exactly what pressing the button does.
 *
 * The whole card is the button. One target, one obvious gesture, and the page
 * stops being a wall of black slabs.
 */
function Card({
  template: t,
  busy,
  onRun,
}: {
  template: Template;
  busy: string | null;
  onRun: (t: Template) => void;
}) {
  const needsSubject = t.run.kind === "compose";
  return (
    <button
      onClick={() => onRun(t)}
      disabled={busy !== null}
      className={`${card(true)} group flex flex-col p-5 text-left disabled:opacity-50 focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_rgb(var(--c-signal))]`}
    >
      <h3 className="t-title">{t.title}</h3>
      <p className="t-caption mt-1.5 flex-1">{t.outcome}</p>
      <p className="t-caption mt-4">{t.apps.join(" · ")}</p>
      <p className="t-caption">{t.approval}</p>
      <span className="mt-4 inline-flex items-center gap-1.5 text-[0.875rem] font-semibold">
        {busy === t.key ? "Starting…" : needsSubject ? "Add your subject" : "Run"}
        <ArrowRight
          size={13}
          strokeWidth={2}
          aria-hidden="true"
          className="transition-transform duration-base ease-brand-out group-hover:translate-x-0.5"
        />
      </span>
    </button>
  );
}
