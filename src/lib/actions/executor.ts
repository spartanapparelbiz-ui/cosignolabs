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
    sim(`searched for "${str(payload.query) ?? "query"}".`, { matches: 0 }),
  summarize: async () => sim("summary generated and saved to the session thread."),
  draft: async (payload) =>
    sim(`draft saved${payload.to ? ` for ${str(payload.to)}` : ""}. nothing was sent.`, {
      draft: payload.body ?? payload.draft ?? null,
    }),
  // The REAL Gmail send is a `connection_call` on a connected account (see
  // providers/gmail.ts). This generic `send_email` category is the sandbox
  // stand-in for users with nothing connected.
  send_email: async (payload) =>
    sim(`email drafted to ${str(payload.to) ?? "recipient"}.`, { subject: payload.subject ?? null }),
  post_content: async (payload) =>
    sim(`content prepared for ${str(payload.destination) ?? "destination"}.`),
  update_record: async (payload, ctx) => {
    // ONE real operation lives inside this otherwise-sandbox category:
    // renaming documents in cosigno's own workspace. It is real because the
    // files are real and cosigno owns them, and it is narrow on purpose —
    // the shape is checked field by field, the ids are only ever the user's
    // own (the store scopes every read and write by user_id), and nothing
    // outside cosigno is touched. Everything else stays a labeled sandbox
    // result, as before.
    if (payload.operation === "rename_workspace_files" && ctx.userId) {
      const renames = Array.isArray(payload.renames) ? payload.renames : [];
      const valid = renames.filter(
        (r): r is { file_id: string; to: string } =>
          typeof r === "object" &&
          r !== null &&
          typeof (r as { file_id?: unknown }).file_id === "string" &&
          typeof (r as { to?: unknown }).to === "string" &&
          (r as { to: string }).to.trim().length > 0 &&
          (r as { to: string }).to.length <= 120
      );
      if (valid.length === 0) {
        return { ok: false, summary: "no valid renames were on the card — nothing was changed." };
      }
      const { getStore } = await import("../store");
      const store = getStore();
      let applied = 0;
      const failed: string[] = [];
      for (const r of valid) {
        // A rename touches only `name`; content is never passed here, so a
        // malformed card cannot rewrite a document.
        const updated = await store
          .updateFile(ctx.userId, r.file_id, { name: r.to.trim() })
          .catch(() => null);
        if (updated) applied += 1;
        else failed.push(r.file_id);
      }
      return {
        ok: applied === valid.length,
        summary:
          applied === valid.length
            ? `renamed ${applied} file${applied === 1 ? "" : "s"}. contents are unchanged.`
            : `renamed ${applied} of ${valid.length} files — ${failed.length} could not be found.`,
        detail: { applied, expected: valid.length, failed },
      };
    }
    return sim(`record ${str(payload.record_id) ?? ""} update prepared.`.replace("  ", " "), {
      changes: payload.changes ?? payload,
    });
  },
  /**
   * The approved input sequence, replayed onto the machine.
   *
   * Everything that makes this safe happened before it got here: the sequence
   * was fixed by the plan, shown in full on the card, and signed. This does
   * not re-derive anything from the screen — it replays exactly what was
   * approved, and the tool reads the screen back afterwards as evidence.
   */
  computer_use: async (payload, ctx) => {
    if (payload.operation !== "computer_input_sequence") {
      return { ok: false, summary: "that isn't a computer input sequence — nothing was done." };
    }
    const inputs = Array.isArray(payload.inputs) ? payload.inputs : [];
    if (inputs.length === 0) {
      return { ok: false, summary: "the card carried no inputs to make — nothing was done." };
    }
    void ctx;
    const { runApprovedComputerInputs } = await import("../missions/computerTools");
    const result = await runApprovedComputerInputs(
      payload.session,
      inputs.map((i) => {
        const o = (i ?? {}) as Record<string, unknown>;
        return {
          kind: String(o.kind ?? ""),
          target: typeof o.target === "string" ? o.target : undefined,
          value: typeof o.value === "string" ? o.value : undefined,
        };
      })
    );
    return {
      ok: result.ok,
      summary: result.summary,
      detail: { inputs_made: result.ran, simulated: result.simulated },
    };
  },
  spend: async (payload) => sim(`spend of ${str(payload.amount) ?? "amount"} recorded.`),
  webhook: async () => sim("webhook prepared for your configured endpoint."),
  delete: async (payload) => sim(`deletion of ${str(payload.target) ?? "target"} prepared.`),
  refund: async (payload) => sim(`refund of ${str(payload.amount) ?? "amount"} prepared.`),
  payment: async (payload) => sim(`payment of ${str(payload.amount) ?? "amount"} prepared.`),
  // The ONE mediated network handler. It does NOT let the model reach an
  // arbitrary endpoint: connection_call is never planner-selectable, its
  // payload is built by the integrations runtime, and it can only target a
  // connection the USER registered and a tool/action the USER enabled +
  // consented to — re-checked again inside runMcpTool / runProviderAction.
  // Still gated by the same tier/approval flow as everything else.
  connection_call: async (payload, ctx) => {
    if (!ctx.userId) return { ok: false, summary: "no user context for this call." };
    const connectionId = str(payload.connection_id);
    if (!connectionId) return { ok: false, summary: "missing connection." };
    const args =
      payload.args && typeof payload.args === "object" && !Array.isArray(payload.args)
        ? (payload.args as Record<string, unknown>)
        : {};
    if (payload.kind === "mcp") {
      const tool = str(payload.tool);
      if (!tool) return { ok: false, summary: "missing tool name." };
      return runMcpTool(ctx.userId, connectionId, tool, args);
    }
    const action = str(payload.action);
    if (!action) return { ok: false, summary: "missing action id." };
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
    return { ok: false, summary: "action category is not in the executor allowlist." };
  }
  const safePayload =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload
      : {};
  return handler(safePayload, ctx);
}
