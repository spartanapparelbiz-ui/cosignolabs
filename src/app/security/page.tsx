import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { Reveal } from "@/components/Reveal";

export const metadata: Metadata = {
  title: "cosigno — security & trust",
  description:
    "how cosigno keeps you in control: server-enforced approvals, injection defense, encrypted credentials, and a permanent audit trail.",
  alternates: { canonical: "https://cosignolabs.com/security" },
};

/**
 * Public trust page. Every claim here is implemented and tested in the
 * shipped product — no aspirational security marketing, and no "impossible
 * to hack" claims. Honest scope: what we enforce, where, and how you can
 * verify it yourself in the audit trail.
 */

const GUARANTEES = [
  {
    title: "approval is enforced in the state machine, not the UI",
    body: "no code path moves an action to executed without a logged user approval. connected tools and custom integrations can propose; only your signature executes. destructive actions additionally require typed confirmation.",
  },
  {
    title: "the agent can never escalate its own permissions",
    body: "the server assigns every action's authority level from its risk class. a request for a lower level is clamped back up, flagged on the card, and logged as a security signal.",
  },
  {
    title: "external content is treated as an attacker",
    body: "email bodies, tool outputs, and MCP responses are wrapped as untrusted data and injection-scanned. content that tries to direct the agent produces a flagged, non-executable card — flagged cards can never be approved by a shortcut.",
  },
  {
    title: "credentials are encrypted and never leave the server",
    body: "oauth tokens and API keys are encrypted at rest with AES-256-GCM, scoped to your user id, protected by row-level security, decrypted only at the moment of an approved call, and never written to a log or sent to the browser.",
  },
  {
    title: "user-supplied endpoints can't reach our insides",
    body: "every URL you connect is SSRF-checked: https only, private/reserved/metadata address ranges blocked, redirects refused, and the host re-verified at call time — with timeouts and response-size caps on every outbound call.",
  },
  {
    title: "spend is capped before the model is ever touched",
    body: "unauthenticated requests are rejected before any AI call. per-user rate limits, a global daily circuit breaker, per-call token caps, and oversized-input rejection all run first.",
  },
  {
    title: "everything is auditable — by you",
    body: "every proposal, approval, veto, and execution is permanently logged with its exact payload, who signed it, and the result. filterable and exportable from your account.",
  },
  {
    title: "the kill switch is immediate",
    body: "disconnect any integration and its stored credentials are deleted at once; its proposals stop immediately. deleting your account cascades through every row you own.",
  },
] as const;

export default function SecurityPage() {
  return (
    <MarketingShell current="/security">
      <section className="mx-auto w-full max-w-4xl px-4 pb-10 pt-10 text-center">
        <h1 className="font-display text-4xl font-bold lowercase tracking-tight sm:text-5xl">
          built so you can check our work
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg font-semibold text-ink-soft">
          cosigno&apos;s security model is simple to state: the agent proposes,
          you approve, the server enforces. here is exactly what that means —
          all of it shipped, tested, and visible in your own audit trail.
        </p>
      </section>

      <section className="mx-auto w-full max-w-5xl px-4 pb-14">
        <div className="grid gap-4 md:grid-cols-2">
          {GUARANTEES.map((g, i) => (
            <Reveal key={g.title} delay={i * 50} className="rounded-card bg-surface p-5 shadow-soft ring-1 ring-inset ring-ink/10">
              <h2 className="text-base font-extrabold lowercase leading-snug">{g.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{g.body}</p>
            </Reveal>
          ))}
        </div>

        <Reveal className="mx-auto mt-10 max-w-2xl text-center">
          <p className="text-sm font-semibold text-ink-soft">
            what we won&apos;t claim: that cosigno is impossible to hack or
            risk-free. no software is. what we do claim — and test — is that no
            action executes without your logged approval, and that you can
            always answer &ldquo;what did it do, and who said yes?&rdquo;
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/sign-up"
              prefetch
              className="rounded-btn bg-signal px-7 py-3.5 text-base font-extrabold text-ink shadow-soft transition-transform duration-fast ease-brand-out hover:-translate-y-px active:scale-95"
            >
              start with cosigno
            </Link>
            <Link href="/privacy" className="text-sm font-bold lowercase underline decoration-signal underline-offset-4 hover:text-signal">
              read the privacy policy
            </Link>
          </div>
        </Reveal>
      </section>
    </MarketingShell>
  );
}
