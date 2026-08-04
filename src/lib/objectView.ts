import type { ActionRecord } from "./types";
import { canonicalize } from "./workspace-model/canonical";
import { splitActionId } from "./twin/model";

/**
 * Real objects, never statistics — and never JSON.
 *
 * "Updated 14 records" tells a person nothing they can act on. What they need
 * is the actual thing that changed:
 *
 *     Customer · Grace          email updated
 *     Customer · John           subscription canceled
 *     Product  · Hydro Bottle   price  $22 → $26
 *
 * This module turns an action's payload and result into those cards. It is
 * pure, deterministic and total — it never throws on a strange payload,
 * because a card that fails to render is a card someone approves blind.
 *
 * THE HARD RULE: nothing in here ever emits JSON, braces, or a raw key. If a
 * value cannot be said in words, the field is described rather than dumped. A
 * user who has to read `{"nested":{"a":1}}` to understand a change is a user
 * the interface has failed.
 */

export interface FieldChange {
  /** Human field name — "Price", not "amount_cents". */
  label: string;
  /** Absent when the field is being set for the first time. */
  before: string | null;
  after: string;
}

export interface ObjectCard {
  /** Canonical type label — "Customer", "Product", "Repository". */
  type: string;
  /** The object's own name, when it has one. */
  name: string;
  /** One phrase: what happened to it. */
  summary: string;
  changes: FieldChange[];
}

export interface ObjectView {
  cards: ObjectCard[];
  /** Objects beyond the ones shown — stated, never silently dropped. */
  more: number;
  /**
   * True when the payload carried nothing describable. The UI shows the
   * action's own sentence instead — it does NOT fall back to a payload dump.
   */
  empty: boolean;
}

/* ------------------------------------------------------------- values */

const MONEY_FIELDS = /amount|price|total|subtotal|cost|balance|fee|value/i;
const SECRET_FIELDS = /token|secret|password|api_?key|authorization|credential/i;

function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})/.test(s);
}

/** Humanize a field name: "amount_cents" → "Price", "cust_name" → "Name". */
export function fieldLabel(field: string): string {
  const base = field
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b(cents|id)\b/gi, "")
    .trim();
  const words = (base || field).toLowerCase();
  if (/^amount|^price|^total/i.test(words)) return "Price";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Format one value for human eyes. Money reads as money, dates as dates,
 * booleans as yes/no — and a value we can't say in words is described, never
 * serialized.
 */
export function formatValue(value: unknown, field = ""): string {
  if (value === null || value === undefined || value === "") return "empty";
  if (typeof value === "boolean") return value ? "yes" : "no";

  if (SECRET_FIELDS.test(field)) return "hidden";

  if (typeof value === "number") {
    if (/cents/i.test(field)) return money(value);
    if (MONEY_FIELDS.test(field)) return money(Math.round(value * 100));
    return value.toLocaleString();
  }

  if (typeof value === "string") {
    if (isIsoDate(value)) {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
      }
    }
    const trimmed = value.trim();
    return trimmed.length > 80 ? `${trimmed.slice(0, 79)}…` : trimmed;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return "none";
    // Name the things when they can be named; count them when they can't.
    const named = value.map((v) => nameOf(v)).filter((n): n is string => Boolean(n));
    if (named.length === value.length && named.length <= 3) return named.join(", ");
    return `${value.length} item${value.length === 1 ? "" : "s"}`;
  }

  if (typeof value === "object") {
    const named = nameOf(value);
    if (named) return named;
    // One level of flattening, in words. Beyond that we say how big it is
    // rather than printing a structure nobody asked to read.
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, v]) => v !== null && typeof v !== "object"
    );
    if (entries.length > 0 && entries.length <= 3) {
      return entries.map(([k, v]) => `${fieldLabel(k).toLowerCase()} ${formatValue(v, k)}`).join(", ");
    }
    const count = Object.keys(value as object).length;
    return `${count} detail${count === 1 ? "" : "s"}`;
  }

  return String(value);
}

const NAME_FIELDS = ["name", "title", "display_name", "full_name", "subject", "label", "email", "slug"];

/** The object's own name, if it carries one. */
function nameOf(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  for (const field of NAME_FIELDS) {
    const v = o[field];
    if (typeof v === "string" && v.trim()) return v.trim().slice(0, 60);
  }
  const id = o.id ?? o.number ?? o.key;
  if (typeof id === "string" || typeof id === "number") return `#${String(id).slice(0, 24)}`;
  return null;
}

/* ------------------------------------------------------------- objects */

const SKIP_KEYS = new Set([
  "kind",
  "connection_id",
  "action",
  "tool",
  "args",
  "provider",
  "provider_key",
  "connection_name",
  "before",
  "after",
  "changes",
  "simulated",
]);

/** What kind of thing this action is about, in one word. */
function objectTypeFor(action: Pick<ActionRecord, "category" | "payload">): string {
  const p = action.payload ?? {};
  const opId = typeof p.action === "string" ? p.action : typeof p.tool === "string" ? p.tool : "";
  if (opId) {
    const { resource } = splitActionId(opId);
    const canonical = canonicalize(resource);
    if (canonical.domain !== "generic") return canonical.label;
  }
  if (typeof p.resource === "string" && p.resource.trim()) return canonicalize(p.resource).label;

  switch (action.category) {
    case "send_email":
    case "draft":
      return "Message";
    case "refund":
      return "Refund";
    case "payment":
    case "spend":
      return "Payment";
    case "post_content":
      return "Post";
    default:
      return "Record";
  }
}

/** "created" / "removed" / "email updated" — what happened, in a phrase. */
function summaryFor(changes: FieldChange[], category: ActionRecord["category"]): string {
  if (category === "delete") return "removed";
  if (changes.length === 0) return category === "search" || category === "summarize" ? "read" : "created";
  if (changes.length === 1) return `${changes[0].label.toLowerCase()} updated`;
  return `${changes.length} details updated`;
}

function changesFrom(before: Record<string, unknown>, after: Record<string, unknown>): FieldChange[] {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => !SKIP_KEYS.has(k));
  return keys
    .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    .map((k) => ({
      label: fieldLabel(k),
      before: k in before ? formatValue(before[k], k) : null,
      after: formatValue(after[k], k),
    }));
}

/** Scalar-ish fields of one object, as "set to" changes. */
function fieldsOf(record: Record<string, unknown>): FieldChange[] {
  return Object.entries(record)
    .filter(([k]) => !SKIP_KEYS.has(k) && !NAME_FIELDS.includes(k))
    .map(([k, v]) => ({ label: fieldLabel(k), before: null, after: formatValue(v, k) }))
    .filter((c) => c.after !== "empty")
    .slice(0, 6);
}

const MAX_CARDS = 6;

/**
 * Turn an action into the objects it touches.
 *
 * Reads, in order: an explicit before/after pair, a `changes` map, arrays of
 * records, then the action's own arguments. The first shape that yields real
 * objects wins — and if none do, the view reports itself EMPTY so the caller
 * shows the action's plain sentence instead of inventing detail.
 */
export function objectsFromAction(
  action: Pick<ActionRecord, "category" | "payload" | "result">
): ObjectView {
  try {
    const payload = (action.payload ?? {}) as Record<string, unknown>;
    const args =
      payload.args && typeof payload.args === "object" && !Array.isArray(payload.args)
        ? (payload.args as Record<string, unknown>)
        : {};
    const source = Object.keys(args).length > 0 ? args : payload;
    const type = objectTypeFor(action);

    // 1. an explicit before → after pair
    const before = source.before ?? payload.before;
    const after = source.after ?? payload.after;
    if (isRecord(before) && isRecord(after)) {
      const changes = changesFrom(before, after);
      if (changes.length > 0) {
        // The name usually sits on the parent object, not inside the
        // before/after pair — a payload names the thing once.
        const name = nameOf(after) ?? nameOf(before) ?? nameOf(source) ?? "";
        return single({ type, name, summary: summaryFor(changes, action.category), changes });
      }
    }

    // 2. a changes map: { price: { from, to } }
    const changeMap = source.changes ?? payload.changes;
    if (isRecord(changeMap)) {
      const changes: FieldChange[] = [];
      for (const [field, v] of Object.entries(changeMap)) {
        if (!isRecord(v)) continue;
        const from = "from" in v ? v.from : "before" in v ? v.before : undefined;
        const to = "to" in v ? v.to : "after" in v ? v.after : undefined;
        if (from === undefined && to === undefined) continue;
        changes.push({
          label: fieldLabel(field),
          before: from === undefined ? null : formatValue(from, field),
          after: formatValue(to, field),
        });
      }
      if (changes.length > 0) {
        return single({ type, name: nameOf(source) ?? "", summary: summaryFor(changes, action.category), changes });
      }
    }

    // 3. arrays of records — one card per real object
    for (const [key, value] of Object.entries(source)) {
      if (!Array.isArray(value) || value.length === 0) continue;
      const records = value.filter(isRecord);
      if (records.length === 0) continue;
      const itemType = canonicalize(key).domain === "generic" ? type : canonicalize(key).label;
      const cards = records.slice(0, MAX_CARDS).map((r) => ({
        type: itemType,
        name: nameOf(r) ?? "",
        summary: summaryFor([], action.category),
        changes: fieldsOf(r),
      }));
      return { cards, more: Math.max(0, records.length - cards.length), empty: false };
    }

    // 4. the action's own arguments, as one object
    const fields = fieldsOf(source);
    const name = nameOf(source) ?? "";
    if (fields.length > 0 || name) {
      return single({
        type,
        name,
        summary: summaryFor(action.category === "update_record" ? fields : [], action.category),
        changes: fields,
      });
    }

    return { cards: [], more: 0, empty: true };
  } catch {
    // A malformed payload must never take a card down; the caller falls back
    // to the action's own sentence.
    return { cards: [], more: 0, empty: true };
  }
}

function single(card: ObjectCard): ObjectView {
  return { cards: [card], more: 0, empty: false };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

/**
 * What an execution actually produced, as objects. Falls back to the result's
 * own summary sentence, which is already plain language.
 */
export function objectsFromResult(result: Record<string, unknown> | null): ObjectView {
  if (!result) return { cards: [], more: 0, empty: true };
  return objectsFromAction({ category: "update_record", payload: result, result: null });
}
