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

export const approveSchema = z
  .object({
    confirmation: z.string().max(100).optional(),
    payload: payloadObject.optional(),
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
  })
  .strict();

export const automationPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    command: z.string().trim().min(1).max(MAX_COMMAND_LENGTH).optional(),
    interval_hours: z.coerce.number().int().min(1).max(720).optional(),
    enabled: z.boolean().optional(),
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
