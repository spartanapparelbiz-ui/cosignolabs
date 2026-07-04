import { ActionCategory } from "../types";

export interface ExecutionResult {
  ok: boolean;
  summary: string;
  detail?: Record<string, unknown>;
}

/**
 * Beta executor. Integrations are stubs (Gmail + generic webhook), so
 * execution simulates the side effect and returns a faithful result record.
 * The contract every real integration must keep: execution happens ONLY
 * here, ONLY server-side, ONLY after the engine has validated approval.
 */
export async function executeAction(
  category: ActionCategory,
  payload: Record<string, unknown>
): Promise<ExecutionResult> {
  switch (category) {
    case "search":
      return {
        ok: true,
        summary: `Search completed for "${str(payload.query) ?? "query"}".`,
        detail: { matches: 0, note: "Connected read integrations are stubbed in beta." },
      };
    case "summarize":
      return {
        ok: true,
        summary: "Summary generated and saved to the session thread.",
      };
    case "draft":
      return {
        ok: true,
        summary: `Draft saved${payload.to ? ` for ${str(payload.to)}` : ""}. Nothing was sent.`,
        detail: { draft: payload.body ?? payload.draft ?? null },
      };
    case "send_email":
      return {
        ok: true,
        summary: `Email queued to ${str(payload.to) ?? "recipient"} via Gmail (stub).`,
        detail: { integration: "gmail-stub", subject: payload.subject ?? null },
      };
    case "post_content":
      return {
        ok: true,
        summary: `Content posted to ${str(payload.destination) ?? "destination"} (stub).`,
      };
    case "update_record":
      return {
        ok: true,
        summary: `Record ${str(payload.record_id) ?? ""} updated (stub).`.replace("  ", " "),
        detail: { changes: payload.changes ?? payload },
      };
    case "spend":
      return {
        ok: true,
        summary: `Spend of ${str(payload.amount) ?? "amount"} recorded (stub).`,
      };
    case "webhook":
      return {
        ok: true,
        summary: `Webhook fired to ${str(payload.url) ?? "configured endpoint"} (stub).`,
      };
    case "delete":
      return {
        ok: true,
        summary: `Deleted ${str(payload.target) ?? "target"} (stub).`,
      };
    case "refund":
      return {
        ok: true,
        summary: `Refund of ${str(payload.amount) ?? "amount"} issued (stub).`,
      };
    case "payment":
      return {
        ok: true,
        summary: `Payment of ${str(payload.amount) ?? "amount"} sent (stub).`,
      };
    default:
      return { ok: false, summary: "Unknown action category." };
  }
}

function str(v: unknown): string | null {
  return typeof v === "string" || typeof v === "number" ? String(v) : null;
}
