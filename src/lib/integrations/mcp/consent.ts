import { categoryIsSensitive, classifyTool } from "./classify";

/**
 * Consent for MCP tools. Nothing an external server advertises is callable
 * until the user turns it on, and a tool that could WRITE or EXFILTRATE data
 * additionally requires an explicit consent acknowledgement.
 *
 * Sensitivity is no longer a separate keyword list — it is derived from the
 * tool's classified category, so the badge the user reads ("sends something out
 * of your account") and the gate they pass through are guaranteed to agree.
 * Two lists would drift, and the day they disagree is the day the UI promises
 * one thing and the engine does another.
 */

/** True if the tool looks like it writes or moves sensitive data. */
export function isSensitiveTool(tool: {
  name: string;
  description: string;
  input_schema?: Record<string, unknown>;
}): boolean {
  const { category, needsReview } = classifyTool(tool);
  return categoryIsSensitive(category, needsReview);
}

/**
 * Can this tool be called right now? Enabled is necessary for every tool;
 * sensitive tools additionally require a recorded consent timestamp.
 */
export function isCallable(tool: {
  enabled: boolean;
  sensitive: boolean;
  consented_at: string | null;
}): boolean {
  if (!tool.enabled) return false;
  if (tool.sensitive && !tool.consented_at) return false;
  return true;
}

/** A tool needs an explicit consent step before it can be enabled. */
export function requiresConsent(tool: { sensitive: boolean }): boolean {
  return tool.sensitive;
}
