import type { ActionCategory, Tier } from "../types";
import type { UntrustedBlock } from "./untrusted";

/**
 * The deterministic offline planner. PURE by design: this module imports
 * only types and is imported by (a) the dev-mode operator and (b) the
 * public landing-page sandbox route. It cannot reach the Anthropic API,
 * the database, or the store — there is nothing here to tamper with.
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
}

export function planWithMock(command: string, blocks: UntrustedBlock[]): MockPlan {
  const c = command.toLowerCase();
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
  if (/(draft|reply|replies|respond|lead)/.test(c)) {
    proposals.push({
      category: "draft",
      summary: "draft replies to the 3 most recent unanswered leads — saved as drafts, nothing sent.",
      payload: {
        count: 3,
        tone: "warm, direct",
        drafts: [
          { to: "lead-1", body: "(draft generated at execution)" },
          { to: "lead-2", body: "(draft generated at execution)" },
          { to: "lead-3", body: "(draft generated at execution)" },
        ],
      },
      requested_tier: 1,
    });
  }
  if (/(send)/.test(c) && !/(draft)/.test(c)) {
    proposals.push({
      category: "send_email",
      summary: "send the follow-up email to the recipient named in your command.",
      payload: { to: "recipient@example.com", subject: "follow-up", body: "(from your command)" },
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
  if (proposals.length === 0) {
    // Unknown input maps to a generic draft-category card: reviewable,
    // reversible, nothing sent.
    proposals.push({
      category: "draft",
      summary: `draft the output of "${command.slice(0, 80)}" for your review — saved, not sent.`,
      payload: { command: command.slice(0, 200), deliverable: "draft" },
      requested_tier: 1,
    });
  }

  const injected = blocks.some((b) => b.injectionSuspected);
  const reasoning = injected
    ? "i planned from your command only. content i read from an external source contained instructions aimed at me — i ignored them and held the affected cards for your review."
    : "i broke your command into the smallest independently-approvable steps. read-only steps run automatically; anything that changes the outside world waits for your signature.";

  return { reasoning, proposals };
}
