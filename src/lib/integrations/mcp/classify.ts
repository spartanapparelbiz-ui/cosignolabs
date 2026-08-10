import type { CapabilityRisk } from "../types";

/**
 * Auto-classification — the bridge between "an MCP server advertised a tool"
 * and "cosigno knows how carefully to treat it".
 *
 * A connector no longer declares its own risk, and cosigno no longer ships a
 * hand-written implementation per tool. Instead every discovered tool is sorted
 * into one of nine categories, and the SERVER maps that category to an approval
 * tier. This is what lets any MCP server inherit the whole governance layer —
 * preview, rules, approvals, signatures, audit — with no per-connector code.
 *
 * Two properties matter more than accuracy:
 *
 *  1. It is WRONG SAFELY. Every tie, every unknown, every ambiguous name lands
 *     on the more cautious category, never the more permissive one. A read tool
 *     misfiled as a write costs one extra click; a delete misfiled as a read
 *     costs data.
 *
 *  2. It ADMITS UNCERTAINTY. When the signal is weak the tool is returned with
 *     `needsReview`, and the UI asks the user once. That answer is stored on
 *     the tool (classified_by = "user") and never asked again — a classifier
 *     that silently guesses teaches people not to trust the badge.
 */

export type ToolCategory =
  | "read"
  | "search"
  | "create"
  | "update"
  | "delete"
  | "send"
  | "payment"
  | "admin"
  | "execute";

export const TOOL_CATEGORIES: ToolCategory[] = [
  "read",
  "search",
  "create",
  "update",
  "delete",
  "send",
  "payment",
  "admin",
  "execute",
];

/**
 * Category → the risk class the existing tier engine already understands
 * (read→tier 1 auto, write→tier 2 signature, destructive→tier 3 typed
 * confirmation). Everything downstream — rules, preview, approvals — is
 * unchanged; this table is the only new mapping in the system.
 *
 * `execute`, `admin` and `payment` sit at destructive deliberately. Running an
 * arbitrary command, changing who has access, and moving money are the three
 * things nobody should discover after the fact.
 */
export const CATEGORY_RISK: Record<ToolCategory, CapabilityRisk> = {
  read: "read",
  search: "read",
  create: "write",
  update: "write",
  send: "write",
  delete: "destructive",
  payment: "destructive",
  admin: "destructive",
  execute: "destructive",
};

/** One line per category, shown under the badge. */
export const CATEGORY_LABEL: Record<ToolCategory, string> = {
  read: "reads data — runs on its own",
  search: "searches and lists — runs on its own",
  create: "creates something new — waits for your signature",
  update: "changes existing data — waits for your signature",
  send: "sends something out of your account — waits for your signature",
  delete: "deletes data — needs typed confirmation",
  payment: "moves money — needs typed confirmation",
  admin: "changes access or settings — needs typed confirmation",
  execute: "runs commands or code — needs typed confirmation",
};

/**
 * Signals per category. A match on a NAME segment counts for much more than a
 * match in the description: a server controls both, but the name is what the
 * tool actually is, while the description is prose that may mention anything
 * ("list_repos — does not delete anything").
 */
const SIGNALS: Record<ToolCategory, { strong: string[]; weak: string[] }> = {
  read: {
    strong: ["get", "read", "fetch", "show", "view", "describe", "inspect", "info", "status", "peek"],
    weak: ["retrieve", "load", "detail", "details", "metadata", "download"],
  },
  search: {
    strong: ["search", "list", "find", "query", "browse", "lookup", "scan", "grep", "index"],
    weak: ["filter", "match", "discover", "enumerate"],
  },
  create: {
    strong: ["create", "add", "new", "insert", "make", "generate", "upload", "clone", "fork", "init"],
    weak: ["draft", "compose", "register", "open", "start", "build"],
  },
  update: {
    strong: ["update", "edit", "modify", "patch", "set", "change", "rename", "move", "write", "append", "label", "tag", "assign", "mark"],
    weak: ["replace", "adjust", "toggle", "sync", "merge", "apply", "comment", "resolve"],
  },
  delete: {
    strong: ["delete", "remove", "destroy", "drop", "purge", "wipe", "erase", "trash", "truncate", "clear"],
    weak: ["archive", "close", "prune", "expire", "discard"],
  },
  send: {
    strong: ["send", "email", "post", "publish", "notify", "message", "dispatch", "broadcast", "share", "invite", "reply", "sms", "tweet"],
    weak: ["deliver", "emit", "announce", "push"],
  },
  payment: {
    strong: ["pay", "payment", "charge", "refund", "invoice", "checkout", "transfer", "payout", "subscription", "billing", "purchase", "order"],
    weak: ["price", "wire", "transaction", "balance"],
  },
  admin: {
    strong: ["grant", "revoke", "permission", "role", "policy", "acl", "member", "owner", "admin", "credential", "secret", "token", "apikey", "iam"],
    weak: ["access", "config", "setting", "settings", "quota", "billing_admin", "user"],
  },
  execute: {
    strong: ["exec", "execute", "run", "shell", "bash", "command", "eval", "spawn", "deploy", "restart", "invoke", "sql"],
    weak: ["script", "job", "task", "container", "process", "trigger"],
  },
};

const STRONG_NAME = 10;
const WEAK_NAME = 5;
const STRONG_DESC = 3;
const WEAK_DESC = 1;

/**
 * When two categories tie, the more cautious one wins. Ordered least → most
 * cautious; a later entry beats an earlier one.
 */
const CAUTION_ORDER: ToolCategory[] = [
  "read",
  "search",
  "create",
  "update",
  "send",
  "delete",
  "admin",
  "payment",
  "execute",
];

function caution(c: ToolCategory): number {
  return CAUTION_ORDER.indexOf(c);
}

/** Split a tool name into comparable word segments: "createIssue" → [create, issue]. */
function segments(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[._:/-]+/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter(Boolean)
  );
}

export interface Classification {
  category: ToolCategory;
  risk: CapabilityRisk;
  /** 0–1. Below REVIEW_THRESHOLD the UI asks the user to confirm, once. */
  confidence: number;
  /** True when cosigno wants a human to confirm the category before use. */
  needsReview: boolean;
  /** The signals that decided it — shown in the "why?" popover. */
  matched: string[];
}

/** Below this, we ask rather than assume. */
export const REVIEW_THRESHOLD = 0.45;

export interface ClassifiableTool {
  name: string;
  description?: string;
  input_schema?: Record<string, unknown>;
}

/**
 * Classify one advertised tool. Pure, deterministic, and never throws — it
 * runs over untrusted server output during discovery.
 */
export function classifyTool(tool: ClassifiableTool): Classification {
  const segs = segments(tool.name);
  const segSet = new Set(segs);
  const descWords = words(tool.description ?? "");

  const scores = new Map<ToolCategory, number>();
  /**
   * Categories with a STRONG signal in the name itself. These are treated
   * separately from the raw score because a name is a claim about what the
   * tool is, while a score is only how loudly it argued. "get_and_delete_record"
   * scores highest as a read — `get` leads the name — and is unmistakably a
   * delete. Score alone gets that wrong, and gets it wrong in the dangerous
   * direction.
   */
  const strongInName = new Set<ToolCategory>();
  const matched: string[] = [];

  for (const category of TOOL_CATEGORIES) {
    const { strong, weak } = SIGNALS[category];
    let score = 0;
    for (const term of strong) {
      if (segSet.has(term)) {
        // The FIRST segment of a tool name is nearly always its verb, so
        // "delete_user" is a delete and "undelete_user" is not.
        score += segs[0] === term ? STRONG_NAME * 1.5 : STRONG_NAME;
        strongInName.add(category);
        matched.push(`name:${term}`);
      } else if (descWords.has(term)) {
        score += STRONG_DESC;
      }
    }
    for (const term of weak) {
      if (segSet.has(term)) {
        score += WEAK_NAME;
        matched.push(`name:${term}`);
      } else if (descWords.has(term)) {
        score += WEAK_DESC;
      }
    }
    if (score > 0) scores.set(category, score);
  }

  // Nothing matched at all: an opaque name from a server we know nothing
  // about. That is precisely the case to ask about rather than guess.
  if (scores.size === 0) {
    return {
      category: hasParameters(tool) ? "update" : "read",
      risk: hasParameters(tool) ? "write" : "read",
      confidence: 0,
      needsReview: true,
      matched: [],
    };
  }

  const ranked = [...scores.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return caution(b[0]) - caution(a[0]); // ties → the more cautious category
  });
  const total = ranked.reduce((sum, [, s]) => sum + s, 0);

  let category: ToolCategory;
  let confidence: number;

  if (strongInName.size > 0) {
    /**
     * A name-level match decides it, and among competing name-level matches
     * the MOST CAUTIOUS wins. "create_refund" is a payment, not a create;
     * "get_and_delete_record" is a delete, not a read. Choosing the safer of
     * two things the name genuinely says costs a confirmation click when it's
     * wrong, and prevents an unreviewed deletion when it's right.
     */
    const candidates = [...strongInName].sort((a, b) => caution(b) - caution(a));
    category = candidates[0];
    const chosen = scores.get(category) ?? 0;
    const loudest = Math.max(...[...strongInName].map((c) => scores.get(c) ?? 0));
    // 1.0 when the cautious reading is also the loudest; lower when we
    // deliberately overrode a louder, less careful one.
    confidence = loudest > 0 ? Math.min(1, chosen / loudest) : 0;
  } else {
    /**
     * Nothing in the name — only the description argued. Confidence is how
     * DECISIVE the winner was, not how loud: 20 against 18 is a coin flip,
     * 10 against 0 is certain. Share-of-total blended with margin captures both.
     */
    const [top, topScore] = ranked[0];
    const runnerUp = ranked[1]?.[1] ?? 0;
    category = top;
    confidence = Math.min(1, (topScore / total) * 0.5 + ((topScore - runnerUp) / topScore) * 0.5);
  }

  /**
   * A tool with REQUIRED parameters that classified as a pure read is the
   * classic mis-read: a "get_report" that takes a body and writes one. Not
   * enough evidence to reclassify, but more than enough to stop asserting.
   */
  const uncertainRead = CATEGORY_RISK[category] === "read" && hasRequiredParameters(tool);

  return {
    category,
    risk: CATEGORY_RISK[category],
    confidence: Number(confidence.toFixed(2)),
    // Kept as an explicit flag rather than derived purely from the number, so
    // a reason to ask can never be lost to a rounding boundary.
    needsReview: confidence < REVIEW_THRESHOLD || uncertainRead,
    matched: [...new Set(matched)].slice(0, 6),
  };
}

function hasParameters(tool: ClassifiableTool): boolean {
  const props = tool.input_schema?.properties;
  return Boolean(props && typeof props === "object" && Object.keys(props).length > 0);
}

function hasRequiredParameters(tool: ClassifiableTool): boolean {
  const req = tool.input_schema?.required;
  return Array.isArray(req) && req.length > 0;
}

/**
 * A tool is "sensitive" — needing an explicit consent acknowledgement before
 * it can be enabled — whenever it does anything other than read, or whenever
 * we aren't sure. This preserves the existing consent gate exactly while
 * deriving it from the richer category instead of a separate keyword list.
 */
export function categoryIsSensitive(category: ToolCategory, needsReview: boolean): boolean {
  return needsReview || CATEGORY_RISK[category] !== "read";
}

/** Parse a stored category string back into the union, or null. */
export function toCategory(value: unknown): ToolCategory | null {
  return typeof value === "string" && (TOOL_CATEGORIES as string[]).includes(value)
    ? (value as ToolCategory)
    : null;
}
