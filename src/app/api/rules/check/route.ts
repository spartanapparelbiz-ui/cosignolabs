import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireUser } from "@/lib/api";
import { parseStrict, readJsonBody } from "@/lib/schemas";
import { getStore } from "@/lib/store";
import {
  applyRequirementToTier,
  applyRules,
  describeRule,
  parsePermissionRule,
} from "@/lib/rules";
import type { ActionRecord, PermissionRuleRecord, Tier } from "@/lib/types";

/**
 * POST /api/rules/check — "what would this rule have done to my past work?"
 *
 * The point of this endpoint is that it does NOT model the rule engine; it
 * RUNS it. `parsePermissionRule` → `applyRules` → `applyRequirementToTier` is
 * the exact path an action takes at the Boundary door, so what a person is
 * shown here is what will actually happen, not a second implementation that
 * can drift away from the first.
 *
 * It reads completed work — the actions a person already watched cosigno do —
 * rather than the v1 agent ledger, because that is the history an ordinary
 * account actually has.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ text: z.string().min(3).max(400) }).strict();

/** How many past actions we look at. Enough to be representative, bounded. */
const WINDOW = 500;

/** What a tier means to a person, in the words the rest of the app uses. */
const TIER_LABEL: Record<number, string> = {
  1: "ran automatically",
  2: "waited for approval",
  3: "needed your signature",
};

interface Affected {
  id: string;
  summary: string;
  created_at: string;
  from: string;
  to: string;
}

/**
 * Recover an amount from an action's payload so value-conditioned rules
 * ("over $200") can be checked. Mirrors what the Boundary passes as
 * `RuleContext.amount`; absent or unparseable means the rule simply won't
 * match, which is the conservative direction.
 */
function amountOf(action: ActionRecord): number | undefined {
  const p = action.payload ?? {};
  for (const key of ["amount", "amount_cents", "total", "value", "price"]) {
    const raw = p[key];
    if (typeof raw === "number" && Number.isFinite(raw)) {
      return key === "amount_cents" ? raw / 100 : raw;
    }
    if (typeof raw === "string") {
      const n = parseFloat(raw.replace(/[$,]/g, ""));
      if (Number.isFinite(n)) return n;
    }
  }
  const m = /\$\s?([\d,]+(?:\.\d{1,2})?)/.exec(action.summary);
  return m ? parseFloat(m[1].replace(/,/g, "")) : undefined;
}

function channelOf(action: ActionRecord): string | undefined {
  const c = (action.payload ?? {}).channel;
  return typeof c === "string" ? c : undefined;
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser();
    const body = parseStrict(schema, await readJsonBody(req), "rule_check");

    const parsed = parsePermissionRule(body.text);

    // A draft is checked as if it were already saved and switched on. Only
    // this one rule is applied — the report answers "what does THIS rule
    // change", not "what would my whole policy do".
    const draft = {
      id: "draft",
      user_id: userId,
      text: body.text,
      enabled: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...parsed,
    } satisfies PermissionRuleRecord;

    const past = await getStore().listActions(userId, { limit: WINDOW });

    const wouldAsk: Affected[] = [];
    const wouldBlock: Affected[] = [];
    const missions = new Set<string>();
    let alreadyCovered = 0;

    for (const action of past) {
      const decision = applyRules([draft], {
        target: action.category,
        category: action.category,
        summary: action.summary,
        amount: amountOf(action),
        channel: channelOf(action),
      });
      if (!decision.requirement) continue;

      const { tier, blocked } = applyRequirementToTier(action.tier as Tier, decision.requirement);
      const entry: Affected = {
        id: action.id,
        summary: action.summary,
        created_at: action.created_at,
        from: TIER_LABEL[action.tier] ?? "ran",
        to: blocked ? "would be blocked" : TIER_LABEL[tier] ?? "would wait for approval",
      };

      if (blocked) {
        wouldBlock.push(entry);
        missions.add(action.session_id);
      } else if (tier > action.tier) {
        wouldAsk.push(entry);
        missions.add(action.session_id);
      } else {
        // Matched, but the action already required at least this much. The
        // rule is real; it just has nothing to add here.
        alreadyCovered += 1;
      }
    }

    const changed = wouldAsk.length + wouldBlock.length;

    /**
     * The recommendation is deliberately not a score. It names the one thing
     * a person needs to decide, and it never says "safe" about a rule we
     * could not read confidently.
     */
    const recommendation =
      parsed.confidence === "low"
        ? "review"
        : past.length === 0
          ? "no_history"
          : changed === 0
            ? "no_effect"
            : wouldBlock.length > 0
              ? "review"
              : "safe";

    return NextResponse.json(
      {
        rule: {
          text: body.text,
          description: describeRule(parsed),
          requirement: parsed.requirement,
          confidence: parsed.confidence,
        },
        checked: past.length,
        missions_affected: missions.size,
        changed,
        unaffected: past.length - changed - alreadyCovered,
        already_covered: alreadyCovered,
        // Newest first, capped — the list is evidence, not an export.
        would_ask: wouldAsk.slice(0, 8),
        would_block: wouldBlock.slice(0, 8),
        recommendation,
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (err) {
    return errorResponse(err);
  }
}
