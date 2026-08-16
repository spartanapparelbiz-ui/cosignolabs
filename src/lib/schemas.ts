import { z } from "zod";
import { ApiError } from "./api";
import { logSecurity } from "./log";
import { CATEGORIES } from "./types";

/**
 * Input validation for every API route. All object schemas are STRICT:
 * unknown fields are rejected with 400. Fields a client must never control
 * (status, tier, user_id, result, injection_flag…) are therefore rejected
 * by construction, and their appearance is logged as an attack signal.
 */

export const MAX_COMMAND_LENGTH = 2000;
export const MAX_BODY_BYTES = 100_000;

const PRIVILEGED_FIELDS = new Set([
  "status",
  "tier",
  "user_id",
  "userId",
  "result",
  "injection_flag",
  "tier_note",
  "id",
  "created_at",
  "resolved_at",
]);

const uuid = z.string().uuid();
const categoryEnum = z.enum(
  Object.keys(CATEGORIES) as [string, ...string[]]
);
const statusEnum = z.enum([
  "proposed",
  "approved",
  "vetoed",
  "executing",
  "executed",
  "failed",
]);

/** Payloads are arbitrary JSON objects but never arrays/scalars. */
const payloadObject = z.record(z.string(), z.unknown());

export const commandSchema = z
  .object({
    command: z.string().min(1).max(MAX_COMMAND_LENGTH),
    sessionId: uuid.optional(),
    externalContent: z
      .array(
        z
          .object({
            source: z.string().min(1).max(200),
            content: z.string().min(1).max(8000),
          })
          .strict()
      )
      .max(10)
      .optional(),
  })
  .strict();

/**
 * A drawn signature accompanying an approval (the SIGN interaction). The
 * image is a small PNG data URI — bounded hard so the audit trail stays
 * lean. Optional: approvals without it are one-click APPROVEs.
 */
export const signaturePayloadSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    image: z
      .string()
      .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, "signature must be a PNG data URI")
      .max(80_000)
      .optional(),
  })
  .strict();

export const approveSchema = z
  .object({
    confirmation: z.string().max(100).optional(),
    payload: payloadObject.optional(),
    signature: signaturePayloadSchema.optional(),
  })
  .strict();

/** Saving / replacing the user's stored signature (Hold to Sign). */
export const savedSignatureSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    image: z
      .string()
      .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, "signature must be a PNG data URI")
      .max(80_000),
  })
  .strict();

export const vetoSchema = z
  .object({
    reason: z.string().max(500).optional(),
  })
  .strict();

export const editSchema = z
  .object({
    payload: payloadObject.optional(),
    summary: z.string().min(1).max(500).optional(),
  })
  .strict()
  .refine((v) => v.payload !== undefined || v.summary !== undefined, {
    message: "nothing to update.",
  });

export const tierSettingSchema = z
  .object({
    category: categoryEnum,
    tier: z.union([z.literal(1), z.literal(2)]),
  })
  .strict();

/**
 * The workspace default: how many actions a mission may take before it asks.
 * 0 means unlimited (see UNLIMITED in missions/budget.ts).
 */
export const actionBudgetSchema = z
  .object({ budget: z.number().int().min(0).max(10_000) })
  .strict();

/** More room for one mission that ran out. Additive — never a new total. */
export const budgetIncreaseSchema = z
  .object({ add: z.number().int().min(1).max(100) })
  .strict();

/**
 * A Trust Center row. The capability is validated against the registry in the
 * route (an id here would only duplicate that list and drift from it).
 */
export const trustSettingSchema = z
  .object({
    capability: z.string().trim().min(1).max(40),
    setting: z.enum(["always", "ask", "never"]),
  })
  .strict();

export const betaSchema = z
  .object({
    // name is no longer collected by the founding-beta form (§8 trims fields
    // to the three that double as customer discovery). Kept optional for
    // backward-compat with any older client / stored rows.
    name: z.string().max(120).optional(),
    email: z.string().email().max(200),
    tools: z.string().min(1).max(500),
    workflow: z.string().min(1).max(1000),
    turnstileToken: z.string().max(4096).optional(),
  })
  .strict();

/**
 * A generic API-key connector the user defines. `risk` is optional and, if
 * given, may only make an action MORE restrictive than its server-computed safe
 * default (enforced server-side, not here). Strict: unknown fields rejected.
 */
export const customConnectorSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    base_url: z.string().trim().url().max(400),
    auth: z.object({
      placement: z.enum(["bearer", "header", "query"]),
      name: z.string().trim().max(60).optional(),
    }),
    api_key: z.string().min(1).max(4096),
    actions: z
      .array(
        z.object({
          id: z.string().trim().min(1).max(60).regex(/^[a-z0-9_]+$/, "lowercase letters, digits, underscore"),
          summary: z.string().trim().min(1).max(160),
          method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
          path: z.string().trim().min(1).max(400),
          risk: z.enum(["read", "write", "destructive"]).optional(),
        })
      )
      .min(1)
      .max(20),
  })
  .strict();

/** Recurring mission (automation). Interval bounded 1h..30d. */
export const automationSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    command: z.string().trim().min(1).max(MAX_COMMAND_LENGTH),
    interval_hours: z.coerce.number().int().min(1).max(720),
    // monitor = watch & report; prepare = propose for approval (default);
    // execute = explicit per-rule grant to run routine (tier-2) proposals.
    mode: z.enum(["monitor", "prepare", "execute"]).default("prepare"),
  })
  .strict();

export const automationPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    command: z.string().trim().min(1).max(MAX_COMMAND_LENGTH).optional(),
    interval_hours: z.coerce.number().int().min(1).max(720).optional(),
    mode: z.enum(["monitor", "prepare", "execute"]).optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

/* ------------------------------------------------------------- objectives */

/** Create / edit an objective (an outcome owned over time). */
export const objectiveSchema = z
  .object({
    title: z.string().trim().min(1).max(140),
    // ISO day (YYYY-MM-DD) or omitted for no target.
    target_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "target must be a YYYY-MM-DD date")
      .optional()
      .nullable(),
  })
  .strict();

export const objectivePatchSchema = z
  .object({
    title: z.string().trim().min(1).max(140).optional(),
    target_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "target must be a YYYY-MM-DD date")
      .nullable()
      .optional(),
    status: z.enum(["active", "achieved", "archived"]).optional(),
  })
  .strict();

/** Link / unlink a delegation (session) to an objective. */
export const objectiveLinkSchema = z
  .object({ session_id: uuid })
  .strict();

/* ------------------------------------------------------------ cosigno hold */

export const holdSchema = z
  .object({ scope: z.enum(["none", "external", "all"]) })
  .strict();

/* ----------------------------------------------------------- continuation */

/** Finish this / Do everything you can / Rescue this. */
export const continueSchema = z
  .object({ mode: z.enum(["finish", "everything", "rescue"]) })
  .strict();

/**
 * Grant temporary authority: an eligible category, for 15 minutes to 8
 * hours. Eligibility (unpinned, tier-2, non-SIGN) is enforced server-side
 * against the category — this only shapes the request.
 */
export const temporaryAuthoritySchema = z
  .object({
    category: categoryEnum,
    minutes: z.coerce.number().int().min(15).max(480),
    note: z.string().trim().max(160).optional(),
  })
  .strict();

/** Install / uninstall a skill pack. */
export const skillActionSchema = z
  .object({
    key: z.string().trim().min(1).max(60),
    action: z.enum(["install", "uninstall"]),
  })
  .strict();

/* ------------------------------------------------------------- autopilot */

/** A business question for Ask Cosigno. */
export const autopilotAskSchema = z
  .object({ question: z.string().trim().min(1).max(500) })
  .strict();

/** Disposition change on a detected signal. */
export const signalStatusSchema = z
  .object({ status: z.enum(["seen", "ignored", "actioned"]) })
  .strict();

/**
 * "Take action" from an Autopilot insight: the recommended operator command
 * plus (optionally) the signal it came from, so the signal is marked
 * actioned. The command runs through the exact same pipeline as a typed
 * command — approval-first, unchanged.
 */
export const autopilotActSchema = z
  .object({
    command: z.string().trim().min(1).max(MAX_COMMAND_LENGTH),
    signal_key: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

/** User memory notes — short, plain text. */
export const memorySchema = z
  .object({ content: z.string().trim().min(1).max(300) })
  .strict();

export const memoryPatchSchema = z
  .object({
    content: z.string().trim().min(1).max(300).optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

export const memoryPrefsSchema = z
  .object({ memory_enabled: z.boolean() })
  .strict();

/**
 * Mute or unmute one learned preference. The key is a derived identifier
 * (`avoid:send_email`, `constraint:weekend`), so the pattern is tight enough
 * that nothing else can be smuggled into the stored array.
 */
export const preferenceMuteSchema = z
  .object({
    preference_key: z
      .string()
      .trim()
      .min(3)
      .max(80)
      .regex(/^[a-z]+:[a-z0-9_']+$/, "that isn't a preference we recognise."),
    muted: z.boolean(),
  })
  .strict();

/* ---------------------------------------------------- permission rules */

/** Create a permission rule from plain language (parsed server-side). */
export const permissionRuleSchema = z
  .object({ text: z.string().trim().min(3).max(240) })
  .strict();

/** Preview the parse of a rule without saving it. */
export const permissionRulePreviewSchema = z
  .object({ text: z.string().trim().min(1).max(240) })
  .strict();

/** Edit a rule: toggle it, or adjust its enforced level (never below floor). */
export const permissionRulePatchSchema = z
  .object({
    enabled: z.boolean().optional(),
    requirement: z.enum(["auto", "approve", "sign", "never"]).optional(),
  })
  .strict();

/** Text-based files (deliverables + documents). Content ≤ 80k chars. */
export const fileSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    mime: z.enum(["text/plain", "text/markdown", "text/csv"]),
    content: z.string().max(80000),
    session_id: uuid.optional(),
  })
  .strict();

export const filePatchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    content: z.string().max(80000).optional(),
  })
  .strict()
  .refine((v) => v.name !== undefined || v.content !== undefined, {
    message: "nothing to update.",
  });

/** Durable missions. A mission starts from a template OR a compiled goal. */
export const missionCreateSchema = z
  .object({
    template: z
      .enum(["meeting_prep", "laptop_compare", "inbox_cleanup", "followups", "daily_brief"])
      .optional(),
    goal: z.string().trim().min(3).max(500).optional(),
    // staged file/link sources (ask-box context) to attach to the mission
    sourceIds: z.array(uuid).max(20).optional(),
  })
  .strict()
  .refine((v) => Boolean(v.template) !== Boolean(v.goal), {
    message: "provide exactly one of template or goal.",
  });

/** Adding a link source from the ask box. */
export const sourceLinkSchema = z
  .object({ url: z.string().trim().min(1).max(2048) })
  .strict();

export const sourceIdsSchema = z
  .object({ sourceIds: z.array(uuid).max(20) })
  .strict();

export const missionCompileSchema = z
  .object({
    goal: z.string().trim().min(3).max(500),
    sourceIds: z.array(uuid).max(20).optional(),
  })
  .strict();

export const missionAnswerSchema = z
  .object({ answer: z.string().trim().min(1).max(300) })
  .strict();

export const missionControlSchema = z
  .object({ op: z.enum(["pause", "resume", "stop"]) })
  .strict();

/** Browser-view controls: pause/resume/stop the session, refresh the preview. */
export const browserControlSchema = z
  .object({ op: z.enum(["pause", "resume", "stop", "refresh"]) })
  .strict();

/** Workspaces (teams/household). */
export const workspaceSchema = z
  .object({ name: z.string().trim().min(1).max(80) })
  .strict();

export const workspaceInviteSchema = z
  .object({
    email: z.string().email().max(200),
    role: z.enum(["approver", "member"]).optional(),
  })
  .strict();

export const workspaceMemberPatchSchema = z
  .object({ role: z.enum(["approver", "member"]) })
  .strict();

export const delegatedDecisionSchema = z
  .object({
    action_id: uuid,
    decision: z.enum(["approve", "veto"]),
    reason: z.string().max(500).optional(),
  })
  .strict();

export const actionsQuerySchema = z
  .object({
    session: uuid.optional(),
    status: statusEnum.optional(),
    tier: z.enum(["1", "2", "3"]).optional(),
    category: categoryEnum.optional(),
    limit: z.coerce.number().int().min(1).max(1000).optional(),
    format: z.enum(["csv"]).optional(),
  })
  .strict();

export const idParamSchema = uuid;

/**
 * Read a JSON body with a hard size cap (100 kB) — 413 when exceeded,
 * 400 when unparseable.
 */
export async function readJsonBody(req: Request): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > MAX_BODY_BYTES) {
    throw new ApiError(413, "body_too_large", "that request is too large — the limit is 100 kB.");
  }
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) {
    throw new ApiError(413, "body_too_large", "that request is too large — the limit is 100 kB.");
  }
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "bad_json", "the request body needs to be valid JSON.");
  }
}

/**
 * Strict-parse and convert failures to 400s. If the rejected input carried
 * a privileged field (status, tier, user_id…), log it — that's someone
 * probing, not a typo.
 */
export function parseStrict<T>(
  schema: z.ZodType<T>,
  input: unknown,
  context: string
): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  const offending =
    input && typeof input === "object"
      ? Object.keys(input as Record<string, unknown>).filter((k) =>
          PRIVILEGED_FIELDS.has(k)
        )
      : [];
  if (offending.length > 0) {
    logSecurity("rejected_privileged_field", { context, fields: offending });
    throw new ApiError(
      400,
      "privileged_field",
      `these fields can't come from the client: ${offending.join(", ")}.`
    );
  }

  logSecurity("invalid_input", { context, issues: result.error.issues.slice(0, 5) });
  const first = result.error.issues[0];
  throw new ApiError(
    400,
    "invalid_input",
    first ? `${first.path.join(".") || "body"}: ${first.message}` : "that input didn't validate."
  );
}
