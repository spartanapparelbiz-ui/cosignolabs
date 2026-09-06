/**
 * Provider-neutral COMPUTER-USE interface — the seam for driving a real
 * desktop the way a person does: look at the screen, move, click, type.
 *
 * It is deliberately shaped like the browser provider, for the same reason:
 * the serverless app never hosts the thing being driven. A computer session
 * lives in an external, isolated environment (a hosted VM, a container with a
 * display, a paired agent on the user's own machine); cosigno stores a session
 * reference and a sanitized observation, and the provider does the driving.
 *
 * Two implementations ship, exactly as with the browser:
 *  - SandboxComputerProvider — deterministic, always labeled simulated, so the
 *    whole loop is exercisable and testable with no external infrastructure;
 *  - RemoteComputerProvider — constructed from env, used once a real
 *    environment is configured. Until then it reports itself unavailable and
 *    the computer tools are WITHHELD FROM THE CAPABILITY MANIFEST entirely,
 *    so a deployment without one cannot plan a mission that pretends to
 *    operate a computer.
 *
 * WHY THE SPLIT BELOW IS DIFFERENT FROM THE BROWSER'S
 *
 * On the web, "click a link" is a read. On a desktop it is not: the same
 * gesture opens a document, sends a queued email, or empties a bin, and
 * nothing in the pixels says which. So the line here is drawn at INPUT, not
 * at intent — looking is free, touching is not. Every action that puts input
 * into the machine is consequential and reaches the world only through an
 * approved action card.
 *
 * Everything observed is UNTRUSTED. On-screen text is data; it can never
 * become an instruction, grant a permission, or approve anything.
 */

export type ComputerActionKind =
  /* observation — no input reaches the machine */
  | "screenshot"
  | "readScreen"
  | "listWindows"
  /* input — changes the machine's state */
  | "focusWindow"
  | "moveMouse"
  | "click"
  | "doubleClick"
  | "rightClick"
  | "dragTo"
  | "type"
  | "pressKey"
  | "scroll"
  | "openApp";

/**
 * Kinds that put NO input into the machine. Anything not on this list is
 * consequential and can only run from an approved card.
 *
 * `scroll` and `focusWindow` are deliberately NOT here. Scrolling is input —
 * it fires handlers, triggers infinite loads, and moves what the next click
 * lands on — and focusing a window changes which application receives every
 * keystroke that follows. Both are harmless nine times in ten, which is
 * exactly why they would be easy to wave through.
 */
export const OBSERVATION_KINDS: ReadonlySet<ComputerActionKind> = new Set([
  "screenshot",
  "readScreen",
  "listWindows",
]);

/** Every kind that exists. Anything else is not an action, it is a typo. */
export const COMPUTER_ACTION_KINDS: ReadonlySet<string> = new Set<ComputerActionKind>([
  "screenshot",
  "readScreen",
  "listWindows",
  "focusWindow",
  "moveMouse",
  "click",
  "doubleClick",
  "rightClick",
  "dragTo",
  "type",
  "pressKey",
  "scroll",
  "openApp",
]);

export function isComputerActionKind(kind: string): kind is ComputerActionKind {
  return COMPUTER_ACTION_KINDS.has(kind);
}

export function isConsequentialComputerAction(kind: ComputerActionKind): boolean {
  return !OBSERVATION_KINDS.has(kind);
}

/** One control the provider could identify on screen. */
export interface ScreenControl {
  /** What it is: button, field, menu item, link, checkbox… */
  role: string;
  /** Its visible label. */
  label: string;
  /** Where it is, in screen pixels — the anchor an action targets. */
  x: number;
  y: number;
  /** True when the provider believes it can be interacted with. */
  enabled: boolean;
}

/** A structured, bounded view of a screen — never a raw pixel dump. */
export interface ScreenObservation {
  width: number;
  height: number;
  /** The window that currently has focus. */
  activeWindow: string;
  /** Every window the provider can see, for orientation. */
  windows: string[];
  /** Bounded plain-text of what is legible on screen. UNTRUSTED. */
  visibleText: string;
  /** Controls the provider identified, with their anchors. */
  controls: ScreenControl[];
  /** Reference to a stored screenshot (data URI or provider ref), if captured. */
  screenshotRef?: string;
  warnings: string[];
  /** True when this is a labeled sandbox screen, not a real machine. */
  simulated: boolean;
}

export interface ComputerSessionHandle {
  /** Opaque provider session id — the only thing persisted about the session. */
  providerRef: string;
  provider: string;
  simulated: boolean;
}

export interface ComputerActionInput {
  kind: ComputerActionKind;
  /** A control label, window name, or app name — never raw code or a script. */
  target?: string;
  /** Text to type, or the key name to press. */
  value?: string;
  /** Explicit coordinates, when a label isn't enough. */
  x?: number;
  y?: number;
}

export interface ComputerActionOutcome {
  ok: boolean;
  summary: string;
  /** The screen AFTER the action — how a step verifies what it did. */
  observation?: ScreenObservation;
  simulated: boolean;
}

export interface ComputerProvider {
  key: string;
  /** True once the provider can actually create sessions. */
  isConfigured(): boolean;
  /** Sandbox provider → true; a real environment → false. */
  readonly simulated: boolean;
  createSession(args: { objective: string }): Promise<ComputerSessionHandle>;
  observe(handle: ComputerSessionHandle): Promise<ScreenObservation>;
  act(handle: ComputerSessionHandle, action: ComputerActionInput): Promise<ComputerActionOutcome>;
  destroySession(handle: ComputerSessionHandle): Promise<void>;
}
