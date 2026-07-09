/**
 * Consent + sensitivity for MCP tools. Nothing an external server advertises
 * is callable until the user turns it on, and a tool that could WRITE or
 * EXFILTRATE data additionally requires an explicit consent acknowledgement.
 * The classifier is intentionally conservative: when unsure, mark sensitive.
 */

// Verbs/nouns that imply a write, a send, a deletion, money, or data egress.
const SENSITIVE_HINTS = [
  "write", "create", "update", "delete", "remove", "drop", "send", "email",
  "post", "publish", "push", "deploy", "execute", "run", "exec", "shell",
  "command", "pay", "charge", "refund", "transfer", "purchase", "order",
  "upload", "export", "download", "share", "grant", "revoke", "password",
  "secret", "token", "credential", "key", "wire", "sms", "call",
];

/** True if the tool looks like it writes or moves sensitive data. */
export function isSensitiveTool(tool: {
  name: string;
  description: string;
  input_schema?: Record<string, unknown>;
}): boolean {
  const hay = `${tool.name} ${tool.description}`.toLowerCase();
  if (SENSITIVE_HINTS.some((h) => hay.includes(h))) return true;
  // A tool that declares required input parameters is doing more than a
  // trivial read — treat it as sensitive unless it clearly reads.
  const props = tool.input_schema?.properties;
  const hasParams = props && typeof props === "object" && Object.keys(props).length > 0;
  const looksReadOnly = /\b(list|get|read|search|fetch|find|show|view)\b/.test(hay);
  return Boolean(hasParams) && !looksReadOnly;
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
