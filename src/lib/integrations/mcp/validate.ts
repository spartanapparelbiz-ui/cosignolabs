import { scanUntrusted } from "../../agent/untrusted";
import type { McpToolRecord } from "../types";

/**
 * MCP tools come from an external server we do NOT trust. A malicious or
 * buggy server can advertise tools with hostile names, giant descriptions
 * (a prompt-injection surface once a description reaches the planner),
 * absurd schemas, or malformed JSON. This module is the airlock: it validates
 * and CLAMPS everything before it is cached or ever shown to the planner.
 *
 * Rules:
 *  - names: 1..64 chars, [a-zA-Z0-9_.:-] only (reject anything else outright);
 *  - descriptions: stripped of control/hidden chars, clamped to 400 chars, and
 *    injection-scanned — a flagged description is neutralized, not trusted;
 *  - input_schema: must be a plain JSON object, bounded in size and depth;
 *  - the whole advertised list is capped so one server can't flood the UI.
 */

const MAX_TOOLS = 100;
const MAX_NAME = 64;
const MAX_DESC = 400;
const MAX_SCHEMA_BYTES = 16 * 1024;
const MAX_SCHEMA_DEPTH = 8;
const NAME_RE = /^[a-zA-Z0-9_.:-]{1,64}$/;

/** Zero-width & bidi code points used to smuggle hidden instructions. */
const HIDDEN = new Set([
  0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d,
  0x202e, 0x2066, 0x2067, 0x2068, 0x2069, 0xfeff,
]);

export interface RawTool {
  name?: unknown;
  description?: unknown;
  inputSchema?: unknown;
  input_schema?: unknown;
}

export interface ValidationOutcome {
  tools: Omit<McpToolRecord, "connection_id" | "enabled" | "consented_at">[];
  /** Tools rejected outright, with a reason (surfaced to the user). */
  rejected: { name: string; reason: string }[];
  /** Names whose description looked like an injection attempt. */
  flagged: string[];
}

/**
 * Neutralize control chars and zero-width / bidi tricks — by code point, so
 * there are no control-char regex literals in source.
 */
function stripControl(s: string): string {
  let out = "";
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    if (HIDDEN.has(cp)) continue;
    out += cp < 0x20 || (cp >= 0x7f && cp <= 0x9f) ? " " : ch;
  }
  return out.replace(/\s+/g, " ").trim();
}

function boundedDepthObject(v: unknown, depth: number): boolean {
  if (depth > MAX_SCHEMA_DEPTH) return false;
  if (v === null || typeof v !== "object") return true;
  for (const val of Object.values(v as Record<string, unknown>)) {
    if (!boundedDepthObject(val, depth + 1)) return false;
  }
  return true;
}

/** A tool's schema must be a bounded, plain JSON-Schema-ish object. */
function safeSchema(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  let json: string;
  try {
    json = JSON.stringify(raw);
  } catch {
    return null; // circular / non-serializable
  }
  if (json.length > MAX_SCHEMA_BYTES) return null;
  if (!boundedDepthObject(raw, 0)) return null;
  const obj = raw as Record<string, unknown>;
  return {
    type: "object",
    properties:
      obj.properties && typeof obj.properties === "object" && !Array.isArray(obj.properties)
        ? obj.properties
        : {},
    ...(Array.isArray(obj.required)
      ? { required: obj.required.filter((r) => typeof r === "string") }
      : {}),
  };
}

/** Validate + clamp a server's advertised tool list. Never throws. */
export function validateTools(raw: unknown): ValidationOutcome {
  const out: ValidationOutcome = { tools: [], rejected: [], flagged: [] };
  const list = Array.isArray(raw) ? raw.slice(0, MAX_TOOLS) : [];
  const seen = new Set<string>();

  for (const item of list) {
    const t = (item ?? {}) as RawTool;
    const name = typeof t.name === "string" ? t.name.trim() : "";
    if (!NAME_RE.test(name)) {
      out.rejected.push({
        name: name.slice(0, MAX_NAME) || "(unnamed)",
        reason: "invalid tool name",
      });
      continue;
    }
    if (seen.has(name)) {
      out.rejected.push({ name, reason: "duplicate tool name" });
      continue;
    }
    const schema = safeSchema(t.inputSchema ?? t.input_schema ?? {});
    if (!schema) {
      out.rejected.push({ name, reason: "unsafe or oversized input schema" });
      continue;
    }
    const rawDesc = typeof t.description === "string" ? t.description : "";
    let description = stripControl(rawDesc).slice(0, MAX_DESC);

    // Treat the description as untrusted content: if it reads like an attempt
    // to steer the agent, neutralize it and mark the tool for the user.
    const scan = scanUntrusted(`mcp:${name}`, description);
    if (scan.injectionSuspected) {
      out.flagged.push(name);
      description = "(description withheld — it contained agent-directed text)";
    }

    seen.add(name);
    out.tools.push({
      name,
      description,
      input_schema: schema,
      sensitive: false, // set by the consent layer
    });
  }
  return out;
}
