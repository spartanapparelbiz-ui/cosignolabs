import { createHash } from "crypto";
import type {
  ComputerActionInput,
  ComputerActionOutcome,
  ComputerProvider,
  ComputerSessionHandle,
  ScreenObservation,
} from "./provider";

/**
 * The sandbox computer. Deterministic, offline, and ALWAYS labeled simulated.
 *
 * It exists so the whole computer loop — observe, propose, approve, act,
 * verify — is exercisable and testable without a machine anywhere. It is NOT
 * a way to demo computer use to a user: the computer tools are withheld from
 * the capability manifest unless a real provider is configured, so nothing a
 * person can start ever lands here. That is the difference between a test
 * fixture and a fake feature.
 *
 * Its screen is openly synthetic — a text editor with one document — and
 * every observation says so in its own warnings.
 */

interface SandboxState {
  document: string;
  saved: boolean;
}

const states = new Map<string, SandboxState>();

function ref(seed: string): string {
  return createHash("sha256").update(seed).digest("hex").slice(0, 16);
}

function screen(state: SandboxState): ScreenObservation {
  return {
    width: 1440,
    height: 900,
    activeWindow: "Notes — sandbox",
    windows: ["Notes — sandbox", "Files — sandbox"],
    visibleText: [
      "Notes (sandbox)",
      state.document || "(the document is empty)",
      state.saved ? "Saved" : "Unsaved changes",
    ].join("\n"),
    controls: [
      { role: "field", label: "document body", x: 700, y: 400, enabled: true },
      { role: "button", label: "Save", x: 1300, y: 80, enabled: !state.saved },
      { role: "menu", label: "File", x: 40, y: 20, enabled: true },
    ],
    warnings: ["sandbox screen — this is not a real machine."],
    simulated: true,
  };
}

function stateOf(handle: ComputerSessionHandle): SandboxState {
  let s = states.get(handle.providerRef);
  if (!s) {
    s = { document: "", saved: true };
    states.set(handle.providerRef, s);
  }
  return s;
}

export class SandboxComputerProvider implements ComputerProvider {
  key = "sandbox";
  readonly simulated = true;

  isConfigured(): boolean {
    return true; // always available, but never manifest-visible (see index.ts)
  }

  async createSession(args: { objective: string }): Promise<ComputerSessionHandle> {
    const providerRef = `csbx-${ref(args.objective + Date.now())}`;
    states.set(providerRef, { document: "", saved: true });
    return { providerRef, provider: this.key, simulated: true };
  }

  async observe(handle: ComputerSessionHandle): Promise<ScreenObservation> {
    return screen(stateOf(handle));
  }

  async act(
    handle: ComputerSessionHandle,
    action: ComputerActionInput
  ): Promise<ComputerActionOutcome> {
    const state = stateOf(handle);
    const { kind, target, value } = action;
    switch (kind) {
      case "screenshot":
        return { ok: true, summary: "captured the screen (sandbox).", observation: screen(state), simulated: true };
      case "readScreen":
      case "listWindows":
        return { ok: true, summary: "read the screen (sandbox).", observation: screen(state), simulated: true };
      case "type":
        state.document = `${state.document}${value ?? ""}`;
        state.saved = false;
        return { ok: true, summary: `typed ${value?.length ?? 0} characters.`, observation: screen(state), simulated: true };
      case "click":
      case "doubleClick":
        if ((target ?? "").toLowerCase() === "save") {
          state.saved = true;
          return { ok: true, summary: "clicked Save.", observation: screen(state), simulated: true };
        }
        return { ok: true, summary: `clicked ${target ?? "the screen"}.`, observation: screen(state), simulated: true };
      case "pressKey":
        return { ok: true, summary: `pressed ${value ?? target ?? "a key"}.`, observation: screen(state), simulated: true };
      case "openApp":
      case "focusWindow":
      case "moveMouse":
      case "rightClick":
      case "dragTo":
      case "scroll":
        return { ok: true, summary: `${kind} (sandbox).`, observation: screen(state), simulated: true };
      default:
        return { ok: false, summary: "unknown computer action.", simulated: true };
    }
  }

  async destroySession(handle: ComputerSessionHandle): Promise<void> {
    states.delete(handle.providerRef);
  }
}

/** For tests — forget every sandbox screen. */
export function resetComputerSandboxForTests(): void {
  states.clear();
}
