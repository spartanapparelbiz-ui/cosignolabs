import { logSecurity } from "../log";
import { ActionCategory } from "../types";

export interface ExecutionResult {
  ok: boolean;
  summary: string;
  detail?: Record<string, unknown>;
}

type Handler = (payload: Record<string, unknown>) => Promise<ExecutionResult>;

function str(v: unknown): string | null {
  return typeof v === "string" || typeof v === "number" ? String(v) : null;
}

/**
 * Capability-scoped executor. The ONLY things the agent can cause to run
 * are the handlers in this hardcoded, frozen allowlist — no dynamic
 * dispatch, no eval, no dynamic imports, no shelling out, and no network
 * requests derived from model output. URLs/addresses in a payload are data
 * shown on the card; a real integration must validate targets against its
 * own scoped config before acting (see send_email/webhook notes below).
 *
 * Beta integrations are stubs: execution simulates the side effect and
 * returns a faithful result record. The contract every real integration
 * must keep: execution happens ONLY here, ONLY server-side, ONLY after the
 * engine has validated approval.
 */
const HANDLERS: Readonly<Record<ActionCategory, Handler>> = Object.freeze({
  search: async (payload) => ({
    ok: true,
    summary: `search completed for "${str(payload.query) ?? "query"}".`,
    detail: { matches: 0, note: "connected read integrations are stubbed in beta." },
  }),
  summarize: async () => ({
    ok: true,
    summary: "summary generated and saved to the session thread.",
  }),
  draft: async (payload) => ({
    ok: true,
    summary: `draft saved${payload.to ? ` for ${str(payload.to)}` : ""}. nothing was sent.`,
    detail: { draft: payload.body ?? payload.draft ?? null },
  }),
  // Real Gmail integration must resolve recipients against the connected
  // account's config — never fetch or send to a raw model-supplied address
  // without the card being approved AND the target passing that check.
  send_email: async (payload) => ({
    ok: true,
    summary: `email queued to ${str(payload.to) ?? "recipient"} via Gmail (stub).`,
    detail: { integration: "gmail-stub", subject: payload.subject ?? null },
  }),
  post_content: async (payload) => ({
    ok: true,
    summary: `content posted to ${str(payload.destination) ?? "destination"} (stub).`,
  }),
  update_record: async (payload) => ({
    ok: true,
    summary: `record ${str(payload.record_id) ?? ""} updated (stub).`.replace("  ", " "),
    detail: { changes: payload.changes ?? payload },
  }),
  spend: async (payload) => ({
    ok: true,
    summary: `spend of ${str(payload.amount) ?? "amount"} recorded (stub).`,
  }),
  // Real webhook integration fires ONLY at the user-configured endpoint —
  // a URL inside the payload is display data, never the target.
  webhook: async () => ({
    ok: true,
    summary: "webhook fired to your configured endpoint (stub).",
  }),
  delete: async (payload) => ({
    ok: true,
    summary: `deleted ${str(payload.target) ?? "target"} (stub).`,
  }),
  refund: async (payload) => ({
    ok: true,
    summary: `refund of ${str(payload.amount) ?? "amount"} issued (stub).`,
  }),
  payment: async (payload) => ({
    ok: true,
    summary: `payment of ${str(payload.amount) ?? "amount"} sent (stub).`,
  }),
});

export async function executeAction(
  category: ActionCategory,
  payload: Record<string, unknown>
): Promise<ExecutionResult> {
  const handler = Object.prototype.hasOwnProperty.call(HANDLERS, category)
    ? HANDLERS[category]
    : undefined;
  if (!handler) {
    logSecurity("executor_category_denied", { category });
    return { ok: false, summary: "action category is not in the executor allowlist." };
  }
  const safePayload =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload
      : {};
  return handler(safePayload);
}
