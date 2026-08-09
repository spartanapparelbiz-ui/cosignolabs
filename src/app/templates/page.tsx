import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { Reveal } from "@/components/Reveal";

export const metadata: Metadata = {
  title: "cosigno — templates",
  description:
    "Proven starting commands, organized by outcome — each one shows what it does, which tools it touches, and where your approval sits.",
  alternates: { canonical: "https://cosignolabs.com/templates" },
};

/**
 * Public template library. These are COMMAND templates — real goals the
 * planner turns into action cards, runnable today in the sandbox (simulated
 * tools) or against a connected Gmail. Each names its approval points
 * honestly; nothing here promises an integration that doesn't exist.
 */

interface Template {
  title: string;
  command: string;
  does: string;
  approvals: string;
}

const CATEGORIES: { name: string; templates: Template[] }[] = [
  {
    name: "founder & operations",
    templates: [
      {
        title: "inbox triage + reply prep",
        command: "review my unread email and prepare replies for the ones that need action",
        does: "Searches and reads run instantly; replies are saved as drafts — nothing sends.",
        approvals: "Each send waits for your signature.",
      },
      {
        title: "weekly operating review",
        command: "summarize what happened this week and draft the update for the team",
        does: "Reads your activity, drafts the summary as a deliverable.",
        approvals: "Posting/sending the update is a confirm-level card.",
      },
      {
        title: "meeting preparation",
        command: "prepare tomorrow's client meeting — pull the thread, draft the agenda and a follow-up",
        does: "Reads the relevant thread, drafts an agenda + follow-up email.",
        approvals: "The follow-up sends only after you approve it.",
      },
    ],
  },
  {
    name: "sales & customers",
    templates: [
      {
        title: "lead follow-up sweep",
        command: "draft replies to my 3 most recent leads — warm, direct, held as drafts",
        does: "Drafts each reply; every one is inspectable before anything leaves.",
        approvals: "Sends are confirm-level, one card per recipient.",
      },
      {
        title: "customer feedback synthesis",
        command: "turn this customer feedback into a prioritized list of issues",
        does: "Reads the pasted feedback (treated as untrusted content), organizes it into a ranked list.",
        approvals: "Read/organize only — runs instantly, nothing external moves.",
      },
    ],
  },
  {
    name: "personal productivity",
    templates: [
      {
        title: "newsletter cleanup",
        command: "clear my inbox of newsletters — archive and label them",
        does: "Finds matches, archives + labels in one pass.",
        approvals: "Archive/label is a confirm-level card; you see the exact count first.",
      },
      {
        title: "trash the junk (locked)",
        command: "move everything from this sender to trash",
        does: "Collects the matches and proposes the deletion.",
        approvals: "Trash is locked — it requires typed confirmation, always.",
      },
    ],
  },
];

export default function TemplatesPage() {
  return (
    <MarketingShell current="/templates">
      <section className="mx-auto w-full max-w-4xl px-4 pb-10 pt-10 text-center">
        <h1 className="font-display text-4xl font-bold lowercase tracking-tight sm:text-5xl">
          start from a proven command
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg font-semibold text-ink-soft">
          each template is a real goal the operator turns into action cards —
          with your approval sitting exactly where it should. try any of them in
          the sandbox first: no account, nothing leaves your browser.
        </p>
      </section>

      <section className="mx-auto w-full max-w-5xl px-4 pb-14">
        {CATEGORIES.map((cat, ci) => (
          <div key={cat.name} className={ci > 0 ? "mt-10" : ""}>
            <Reveal>
              <h2 className="text-xs font-extrabold lowercase tracking-widest text-ink-soft">
                {cat.name}
              </h2>
            </Reveal>
            <div className="mt-3 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {cat.templates.map((t, i) => (
                <Reveal
                  key={t.title}
                  delay={i * 60}
                  className="flex flex-col rounded-card bg-surface p-5 shadow-soft ring-1 ring-inset ring-ink/10"
                >
                  <h3 className="font-display text-base font-bold lowercase leading-snug">
                    {t.title}
                  </h3>
                  <p className="mt-2 rounded-btn bg-cream-deep/70 px-3 py-2 font-mono text-[11px] leading-relaxed text-ink-soft">
                    “{t.command}”
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-ink-soft">{t.does}</p>
                  <p className="mt-1.5 text-[11px] font-bold lowercase text-signal">
                    {t.approvals}
                  </p>
                  <Link
                    href={`/demo?task=${encodeURIComponent(t.command)}`}
                    className="mt-auto pt-3 text-xs font-bold lowercase underline decoration-signal underline-offset-4 hover:text-signal"
                  >
                    try this in the demo dashboard →
                  </Link>
                </Reveal>
              ))}
            </div>
          </div>
        ))}

        <Reveal className="mx-auto mt-12 max-w-2xl text-center">
          <p className="text-sm font-semibold text-ink-soft">
            the sandbox runs against simulated tools; connect your own accounts
            in the app to run these for real — approval-first, always.
          </p>
          <div className="mt-5">
            <Link
              href="/sign-up"
              prefetch
              className="rounded-btn bg-signal px-7 py-3.5 text-base font-extrabold text-ink shadow-soft transition-transform duration-fast ease-brand-out hover:-translate-y-px active:scale-95"
            >
              start with cosigno
            </Link>
          </div>
        </Reveal>
      </section>
    </MarketingShell>
  );
}
