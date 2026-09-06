import { getStore } from "../store";
import type { FileRecord } from "../types";
import type { MissionTool, ToolContext, ToolResult } from "./tools";

/**
 * THE SANDBOXED COMPUTE TOOL — arithmetic and data work over the mission's
 * own files, with no shell anywhere near it.
 *
 * A word about what this is not. The obvious reading of "sandboxed terminal"
 * is a shell in a container, and this application cannot have one: it runs
 * serverless, and its own security suite forbids process spawning anywhere in
 * `src` by name. That test is right. A general shell reachable from model
 * output is the single largest hole a product like this could open, and
 * "sandboxed" is doing a great deal of load-bearing work in any sentence that
 * claims otherwise.
 *
 * So this is an INTERPRETER over a closed set of operations, not an
 * evaluator. There is no `eval`, no dynamic dispatch, no code path from a
 * string to execution: a command is parsed into a verb from a fixed list plus
 * literal arguments, and an ordinary TypeScript function does the work. The
 * worst a malformed or malicious command can achieve is an error message.
 *
 * What it actually buys: the honest arithmetic a research mission needs and
 * a language model should not be asked to do in its head — totals, averages,
 * medians, row counts, deduplication — computed from a file the user can
 * open, with the numbers shown.
 *
 * It reads only the caller's own files (every store read is user-scoped),
 * writes nothing, and reaches no network. There are no secrets in its
 * environment because it has no environment.
 */

/** Everything this tool can do. Adding a verb is a deliberate, reviewed act. */
const VERBS = [
  "lines",
  "words",
  "rows",
  "sum",
  "avg",
  "min",
  "max",
  "median",
  "count",
  "unique",
] as const;
type Verb = (typeof VERBS)[number];

function isVerb(v: string): v is Verb {
  return (VERBS as readonly string[]).includes(v);
}

export interface ComputeCommand {
  verb: Verb;
  /** The file to read, by name (matched case-insensitively). */
  file: string;
  /** The column to operate on, for the column verbs. */
  column?: string;
}

/**
 * Parse one command. Strict by construction: a fixed verb, then literal
 * arguments, and nothing else. No quoting rules to get wrong, no operators,
 * no substitution, no chaining — a `;` or a `|` is simply part of a filename
 * as far as this is concerned, because there is nothing for it to chain to.
 */
export function parseComputeCommand(input: string): ComputeCommand | { error: string } {
  const parts = input.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { error: "no command was given." };
  const verb = parts[0].toLowerCase();
  if (!isVerb(verb)) {
    return { error: `“${parts[0]}” isn't something this tool can do. it knows: ${VERBS.join(", ")}.` };
  }
  const needsColumn = ["sum", "avg", "min", "max", "median", "unique"].includes(verb);
  if (parts.length < 2) return { error: `“${verb}” needs a file to read.` };
  if (needsColumn && parts.length < 3) return { error: `“${verb}” needs a file and a column.` };

  // The column is the LAST token for column verbs, so a filename may contain
  // spaces without needing quotes.
  const column = needsColumn ? parts[parts.length - 1] : undefined;
  const file = (needsColumn ? parts.slice(1, -1) : parts.slice(1)).join(" ");
  if (!file) return { error: `“${verb}” needs a file to read.` };
  return { verb, file, column };
}

/** Rows out of a markdown table or a CSV — the two shapes this app writes. */
export function tableOf(content: string): { header: string[]; rows: string[][] } {
  const lines = content.split("\n").map((l) => l.trim()).filter(Boolean);

  const mdRows = lines
    .filter((l) => l.startsWith("|") && l.endsWith("|"))
    .map((l) => l.slice(1, -1).split("|").map((c) => c.trim()));
  // A markdown table's second row is the `---` separator, which is structure
  // rather than data.
  const md = mdRows.filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c)));
  if (md.length >= 2) return { header: md[0], rows: md.slice(1) };

  const csv = lines.filter((l) => l.includes(",")).map((l) => l.split(",").map((c) => c.trim()));
  if (csv.length >= 2) return { header: csv[0], rows: csv.slice(1) };

  return { header: [], rows: [] };
}

/** The numeric value of a cell, or null when it isn't a number. */
function numberIn(cell: string): number | null {
  const m = /-?[0-9][0-9,]*(?:\.[0-9]+)?/.exec(cell.replace(/[$£€]/g, ""));
  if (!m) return null;
  const n = Number(m[0].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function columnValues(
  content: string,
  column: string
): { values: string[]; matchedColumn: string } | { error: string } {
  const { header, rows } = tableOf(content);
  if (header.length === 0) return { error: "that file has no table or CSV in it to read." };
  const idx = header.findIndex((h) => h.toLowerCase() === column.toLowerCase());
  if (idx === -1) {
    return { error: `there's no “${column}” column. the columns are: ${header.join(", ")}.` };
  }
  return { values: rows.map((r) => r[idx] ?? ""), matchedColumn: header[idx] };
}

function median(ns: number[]): number {
  const s = [...ns].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

export interface ComputeOutcome {
  ok: boolean;
  answer: string;
  value?: number;
  /** How many rows carried a usable number — the honesty half of an average. */
  used?: number;
  skipped?: number;
}

/** Run one parsed command against one file. Pure — no I/O, no environment. */
export function runComputeCommand(cmd: ComputeCommand, file: FileRecord): ComputeOutcome {
  if (cmd.verb === "lines") {
    const n = file.content.split("\n").length;
    return { ok: true, answer: `${file.name} has ${n} line${n === 1 ? "" : "s"}.`, value: n };
  }
  if (cmd.verb === "words") {
    const n = file.content.split(/\s+/).filter(Boolean).length;
    return { ok: true, answer: `${file.name} has ${n} word${n === 1 ? "" : "s"}.`, value: n };
  }
  if (cmd.verb === "rows" || cmd.verb === "count") {
    const { rows } = tableOf(file.content);
    return { ok: true, answer: `${file.name} has ${rows.length} data row${rows.length === 1 ? "" : "s"}.`, value: rows.length };
  }

  const col = columnValues(file.content, cmd.column!);
  if ("error" in col) return { ok: false, answer: col.error };

  if (cmd.verb === "unique") {
    const seen = [...new Set(col.values.map((v) => v.trim()).filter(Boolean))];
    return {
      ok: true,
      answer: `${seen.length} distinct value${seen.length === 1 ? "" : "s"} in “${col.matchedColumn}”: ${seen.slice(0, 20).join(", ")}${seen.length > 20 ? "…" : ""}.`,
      value: seen.length,
    };
  }

  const numbers = col.values.map(numberIn).filter((n): n is number => n !== null);
  const skipped = col.values.length - numbers.length;
  if (numbers.length === 0) {
    return { ok: false, answer: `no row in “${col.matchedColumn}” carries a number, so there's nothing to calculate.` };
  }

  // Every answer says how many rows it is FROM. An average over three of
  // eleven rows is a different fact from an average over eleven, and a bare
  // number hides which one you were given.
  const from = `from ${numbers.length} row${numbers.length === 1 ? "" : "s"}${skipped > 0 ? ` (${skipped} had no number and were left out)` : ""}`;
  const value =
    cmd.verb === "sum"
      ? numbers.reduce((a, b) => a + b, 0)
      : cmd.verb === "avg"
        ? numbers.reduce((a, b) => a + b, 0) / numbers.length
        : cmd.verb === "min"
          ? Math.min(...numbers)
          : cmd.verb === "max"
            ? Math.max(...numbers)
            : median(numbers);
  const rounded = Math.round(value * 100) / 100;
  return {
    ok: true,
    answer: `${cmd.verb} of “${col.matchedColumn}” is ${rounded.toLocaleString()} — ${from}.`,
    value: rounded,
    used: numbers.length,
    skipped,
  };
}

/**
 * The step's command comes from its own purpose line, in backticks. The plan
 * is what decides the arithmetic; nothing here reads a command out of a web
 * page, a file's contents, or a model's free-form output.
 */
function commandIn(purpose: string): string | null {
  const m = /`([^`]{1,200})`/.exec(purpose);
  return m ? m[1] : null;
}

const computeRun: MissionTool = {
  id: "compute.run",
  timeoutMs: 15_000,
  async run(ctx: ToolContext): Promise<ToolResult> {
    const raw = commandIn(ctx.step.purpose);
    if (!raw) {
      return {
        kind: "ok",
        summary: `this step didn't name a calculation to run. it can do: ${VERBS.join(", ")}.`,
        output: { skipped: true },
        sources: [],
      };
    }
    const parsed = parseComputeCommand(raw);
    if ("error" in parsed) {
      return { kind: "ok", summary: parsed.error, output: { command: raw, ok: false }, sources: [] };
    }

    const files = await getStore().listFiles(ctx.userId);
    const file =
      files.find((f) => f.name.toLowerCase() === parsed.file.toLowerCase()) ??
      files.find((f) => f.name.toLowerCase().includes(parsed.file.toLowerCase()));
    if (!file) {
      return {
        kind: "ok",
        summary: `there's no file called “${parsed.file}” in your workspace.`,
        output: { command: raw, ok: false },
        sources: [],
      };
    }

    const outcome = runComputeCommand(parsed, file);
    return {
      kind: "ok",
      summary: outcome.answer,
      output: {
        command: raw,
        ok: outcome.ok,
        value: outcome.value ?? null,
        rows_used: outcome.used ?? null,
        rows_skipped: outcome.skipped ?? null,
        file: file.name,
      },
      sources: [
        { name: "files", detail: `calculated from “${file.name}”`, simulated: false },
      ],
    };
  },
};

export const COMPUTE_TOOLS: Record<string, MissionTool> = {
  [computeRun.id]: computeRun,
};
