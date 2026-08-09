import { logSecurity } from "../log";
import { ActionCategory } from "../types";
import { runMcpTool, runProviderAction } from "../integrations/runtime/connections";
import { runCustomApiAction } from "../integrations/runtime/customApi";

export interface ExecutionResult {
  ok: boolean;
  summary: string;
  detail?: Record<string, unknown>;
}

/** Execution context threaded from the engine (who owns the action). */
export interface ExecContext {
  userId?: string;
}

type Handler = (
  payload: Record<string, unknown>,
  ctx: ExecContext
) => Promise<ExecutionResult>;

function str(v: unknown): string | null {
  return typeof v === "string" || typeof v === "number" ? String(v) : null;
}

/**
 * A SIMULATED (sandbox) result. Every non-connector category is a sandbox
 * side effect — it does not touch a real account. We mark it structurally
 * (`simulated: true`) so the UI and audit log label it "sandbox · simulated"
 * and can never be mistaken for a real, connected-account action. Real work
 * flows through `connection_call` (a connected app / MCP tool).
 */
function sim(summary: string, detail: Record<string, unknown> = {}): ExecutionResult {
  return { ok: true, summary, detail: { ...detail, simulated: true } };
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
  search: async (payload) =>
    sim(`Searched for "${str(payload.query) ?? "query"}".`, { matches: 0 }),
  summarize: async () => sim("Summary generated and saved to the session thread."),
  draft: async (payload) =>
    sim(`Draft saved${payload.to ? ` for ${str(payload.to)}` : ""}. Nothing was sent.`, {
      draft: payload.body ?? payload.draft ?? null,
    }),
  // The REAL Gmail send is a `connection_call` on a connected account (see
  // providers/gmail.ts). This generic `send_email` category is the sandbox
  // stand-in for users with nothing connected.
  send_email: async (payload) =>
    sim(`Email drafted to ${str(payload.to) ?? "recipient"}.`, { subject: payload.subject ?? null }),
  post_content: async (payload) =>
    sim(`Content prepared for ${str(payload.destination) ?? "destination"}.`),
  update_record: async (payload) =>
    sim(`Record ${str(payload.record_id) ?? ""} update prepared.`.replace("  ", " "), {
      changes: payload.changes ?? payload,
    }),
  spend: async (payload) => sim(`Spend of ${str(payload.amount) ?? "amount"} recorded.`),
  webhook: async () => sim("Webhook prepared for your configured endpoint."),
  delete: async (payload) => sim(`Deletion of ${str(payload.target) ?? "target"} prepared.`),
  refund: async (payload) => sim(`Refund of ${str(payload.amount) ?? "amount"} prepared.`),
  payment: async (payload) => sim(`Payment of ${str(payload.amount) ?? "amount"} prepared.`),
  // The ONE mediated network handler. It does NOT let the model reach an
  // arbitrary endpoint: connection_call is never planner-selectable, its
  // payload is built by the integrations runtime, and it can only target a
  // connection the USER registered and a tool/action the USER enabled +
  // consented to — re-checked again inside runMcpTool / runProviderAction.
  // Still gated by the same tier/approval flow as everything else.
  connection_call: async (payload, ctx) => {
    if (!ctx.userId) return { ok: false, summary: "No user context for this call." };
    const connectionId = str(payload.connection_id);
    if (!connectionId) return { ok: false, summary: "Missing connection." };
    const args =
      payload.args && typeof payload.args === "object" && !Array.isArray(payload.args)
        ? (payload.args as Record<string, unknown>)
        : {};
    if (payload.kind === "mcp") {
      const tool = str(payload.tool);
      if (!tool) return { ok: false, summary: "Missing tool name." };
      return runMcpTool(ctx.userId, connectionId, tool, args);
    }
    const action = str(payload.action);
    if (!action) return { ok: false, summary: "Missing action id." };
    if (payload.kind === "custom") {
      return runCustomApiAction(ctx.userId, connectionId, action, args);
    }
    return runProviderAction(ctx.userId, connectionId, action, args);
  },
});

export async function executeAction(
  category: ActionCategory,
  payload: Record<string, unknown>,
  ctx: ExecContext = {}
): Promise<ExecutionResult> {
  const handler = Object.prototype.hasOwnProperty.call(HANDLERS, category)
    ? HANDLERS[category]
    : undefined;
  if (!handler) {
    logSecurity("executor_category_denied", { category });
    return { ok: false, summary: "Action category is not in the executor allowlist." };
  }
  const safePayload =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload
      : {};
  return handler(safePayload, ctx);
}
