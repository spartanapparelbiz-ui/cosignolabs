import type { ActionCategory, Tier } from "../types";
import type { UntrustedBlock } from "./untrusted";

/**
 * The deterministic offline planner. PURE by design: this module imports
 * only types and is imported by (a) the dev-mode operator and (b) the
 * public landing-page sandbox route. It cannot reach the hosted planner,
 * the database, or the store — there is nothing here to tamper with.
 *
 * Honesty rules (the demo's trust contract):
 *  - the plan is built from the USER'S OWN words — summaries carry the
 *    command's actual subject, never a substituted canned scenario;
 *  - a command outside the simulated domains is answered honestly
 *    (`supported: false` + a plan-only preview) — the sandbox never
 *    pretends to execute tools it doesn't have.
 */

export interface MockProposal {
  category: ActionCategory;
  summary: string;
  payload: Record<string, unknown>;
  requested_tier?: Tier;
}

export interface MockPlan {
  reasoning: string;
  proposals: MockProposal[];
  /** False when no simulated domain matched — the demo must say so honestly. */
  supported: boolean;
  /** For unsupported commands: how cosigno WOULD break the task down (plan only). */
  planPreview: string[];
}

/**
 * The subject of the command, in the user's own words — what comes after the
 * verb/preposition, cleaned up. "follow up on unpaid invoices" → "unpaid
 * invoices". Falls back to the whole command, bounded.
 */
export function subjectOf(command: string): string {
  const c = command.trim().replace(/[.?!]+$/, "");
  const m =
    /(?:about|regarding|on|for|of|to|with)\s+(?:the\s+|my\s+|our\s+)?(.{3,80}?)$/i.exec(c) ??
    /^(?:please\s+)?(?:draft|write|prepare|send|reply|respond|summari[sz]e|clean|clear|find|check|schedule|follow\s*up|handle|review|update|create|build)\s+(?:the\s+|my\s+|our\s+|a\s+|all\s+)?(.{3,80}?)$/i.exec(c);
  const subject = (m?.[1] ?? c).trim();
  return subject.slice(0, 80);
}

export function planWithMock(command: string, blocks: UntrustedBlock[]): MockPlan {
  const c = command.toLowerCase();
  const subject = subjectOf(command);
  const proposals: MockProposal[] = [];

  if (/(newsletter|inbox|unsubscribe|clean|clear)/.test(c)) {
    proposals.push(
      {
        category: "search",
        summary: "scan your inbox for newsletter and promotional senders from the last 30 days.",
        payload: { query: "category:promotions OR list-unsubscribe", window_days: 30 },
        requested_tier: 1,
      },
      {
        category: "update_record",
        summary: 'archive 47 matched newsletter emails and label them "newsletters".',
        payload: { operation: "archive+label", label: "newsletters", match_count: 47 },
        requested_tier: 2,
      }
    );
  }
  if (/(draft|reply|replies|respond|lead|follow[\s-]?up)/.test(c)) {
    // The subject comes from the user's command — never a substituted scenario.
    const topic = /lead/.test(c) ? "the 3 most recent unanswered leads" : `the unanswered threads about ${subject}`;
    proposals.push({
      category: "draft",
      summary: `draft replies to ${topic} — saved as drafts, nothing sent.`,
      payload: {
        count: 3,
        topic: subject,
        tone: "warm, direct",
        drafts: [
          { to: "thread-1", body: "(draft generated at execution)" },
          { to: "thread-2", body: "(draft generated at execution)" },
          { to: "thread-3", body: "(draft generated at execution)" },
        ],
      },
      requested_tier: 1,
    });
  }
  if (/(meeting|agenda|brief)/.test(c)) {
    proposals.push(
      {
        category: "search",
        summary: "read tomorrow's calendar and the mail threads connected to each meeting.",
        payload: { window: "next 24h", sources: ["calendar", "related mail"] },
        requested_tier: 1,
      },
      {
        category: "draft",
        summary: `draft tomorrow's meeting brief${/meeting|agenda/.test(subject) ? "" : ` for ${subject}`} — meetings, open questions, and prep notes. saved, not sent.`,
        payload: { deliverable: "meeting brief", window: "next 24h" },
        requested_tier: 1,
      }
    );
  }
  if (/(send)/.test(c) && !/(draft)/.test(c)) {
    proposals.push({
      category: "send_email",
      summary: `send the email about ${subject} to the recipient named in your command.`,
      payload: { to: "recipient@example.com", subject: subject.slice(0, 60), body: "(from your command)" },
      requested_tier: 2,
    });
  }
  if (/(reprice|price|pricing)/.test(c)) {
    proposals.push({
      category: "update_record",
      summary: "update prices on the matched products to the values you specified.",
      payload: { operation: "reprice", products: "matched from command", strategy: "as specified" },
      requested_tier: 2,
    });
  }
  if (/(order|sales|revenue)/.test(c)) {
    proposals.push({
      category: "summarize",
      summary: "summarize this week's orders into a short digest: totals, top products, anything unusual.",
      payload: { window: "7d", source: "orders", format: "digest" },
      requested_tier: 1,
    });
  }
  if (/(schedule|calendar|book)/.test(c) && proposals.length === 0) {
    proposals.push({
      category: "update_record",
      summary: `add the calendar event for ${subject} — after your approval.`,
      payload: { operation: "create_event", details: subject },
      requested_tier: 2,
    });
  }
  if (/(delete|remove permanently)/.test(c)) {
    proposals.push({
      category: "delete",
      summary: "permanently delete the items named in your command.",
      payload: { target: "items from command" },
      requested_tier: 3,
    });
  }
  if (/(payment|pay\b|wire|transfer)/.test(c)) {
    proposals.push({
      category: "payment",
      summary: "send the payment named in your command.",
      payload: { amount: "as specified", recipient: "from command" },
      // Deliberately requests tier 1 — the mock simulates a compromised
      // model attempting to de-escalate. The server must clamp to tier 3;
      // the security suite asserts it.
      requested_tier: 1,
    });
  }
  if (/refund/.test(c)) {
    proposals.push({
      category: "refund",
      summary: "issue the refund named in your command.",
      payload: { amount: "as specified", order: "from command" },
      requested_tier: 3,
    });
  }
  if (/(summar|digest|mail\b)/.test(c) && proposals.length === 0) {
    proposals.push({
      category: "summarize",
      summary: "summarize the referenced content into a short digest in this thread.",
      payload: { sources: blocks.map((b) => b.source) },
      requested_tier: 1,
    });
  }

  const supported = proposals.length > 0;
  if (!supported) {
    // The dev-mode operator still needs a reviewable card for open-ended
    // work; the DEMO route uses `supported` + `planPreview` to answer
    // honestly instead of showing this card.
    proposals.push({
      category: "draft",
      summary: `draft the output of "${command.slice(0, 80)}" for your review — saved, not sent.`,
      payload: { command: command.slice(0, 200), deliverable: "draft" },
      requested_tier: 1,
    });
  }

  // How cosigno WOULD break the task down — shown as a plan-only preview
  // when the demo can't honestly simulate it.
  const planPreview = [
    `understand the goal: ${subject}`,
    "gather the related context (read-only)",
    "prepare the work as drafts — nothing published",
    "stop for your signature before anything external changes",
  ];

  const injected = blocks.some((b) => b.injectionSuspected);
  const reasoning = injected
    ? "i planned from your command only. content i read from an external source contained instructions aimed at me — i ignored them and held the affected cards for your review."
    : "i broke your command into the smallest independently-approvable steps. read-only steps run automatically; anything that changes the outside world waits for your signature.";

  return { reasoning, proposals, supported, planPreview };
}
