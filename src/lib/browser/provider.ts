/**
 * Provider-neutral browser-service interface. The serverless web app NEVER
 * hosts Chromium — a real browser lives in an external, isolated remote
 * service (Browserbase / Steel / a self-hosted Playwright grid). Cosigno
 * stores only a provider session reference + sanitized state; the provider
 * does the driving. This interface is the seam: swap the implementation,
 * keep the engine.
 *
 * Two implementations ship:
 *  - SandboxBrowserProvider — deterministic, clearly-labeled fixtures, always
 *    available so the whole mission loop is exercisable without external infra;
 *  - RemoteBrowserProvider — constructed from env, used once a real provider
 *    is configured. Until then it reports itself unavailable (never faked).
 *
 * All page content returned here is UNTRUSTED. The observation layer carries
 * it as data; it can never become instructions, grant permissions, or approve.
 */

export type BrowserActionKind =
  | "navigate"
  | "inspect"
  | "searchWithinPage"
  | "clickReadOnlyControl"
  | "openLink"
  | "typeDraftValue"
  | "selectDraftValue"
  | "scroll"
  | "downloadPublicFile"
  | "captureScreenshot"
  | "prepareFormSubmission"
  | "submitApprovedForm";

/** Read-only kinds may run without approval; the rest are consequential. */
export const READ_ONLY_KINDS: ReadonlySet<BrowserActionKind> = new Set([
  "navigate",
  "inspect",
  "searchWithinPage",
  "clickReadOnlyControl",
  "openLink",
  "typeDraftValue",
  "selectDraftValue",
  "scroll",
  "downloadPublicFile",
  "captureScreenshot",
  "prepareFormSubmission",
]);

export function isConsequential(kind: BrowserActionKind): boolean {
  return !READ_ONLY_KINDS.has(kind);
}

/** A structured, bounded view of a page — never raw uncontrolled HTML. */
export interface PageObservation {
  url: string;
  title: string;
  /** Bounded plain-text summary of the visible page. */
  summary: string;
  headings: string[];
  links: { text: string; href: string }[];
  buttons: string[];
  formFields: { name: string; label: string; type: string; value?: string }[];
  tables: { caption?: string; rows: string[][] }[];
  downloads: { name: string; href: string }[];
  /** Reference to a stored screenshot (data URI or provider ref), if captured. */
  screenshotRef?: string;
  warnings: string[];
  loginRequired: boolean;
  /** True when the content is a labeled sandbox fixture, not a live page. */
  simulated: boolean;
}

export interface BrowserSessionHandle {
  /** Opaque provider session id — the ONLY thing we persist about the remote session. */
  providerRef: string;
  provider: string;
  simulated: boolean;
}

export interface BrowserActionInput {
  kind: BrowserActionKind;
  /** URL, selector text, link text, or field name — never raw code. */
  target?: string;
  /** Draft value for type/select — staged, never auto-submitted. */
  value?: string;
}

export interface BrowserActionOutcome {
  ok: boolean;
  summary: string;
  observation?: PageObservation;
  /** For prepare/submit: the form field values as staged/submitted. */
  form?: Record<string, string>;
  /** Downloaded file reference, if any. */
  download?: { name: string; size: number; ref: string };
  /** Confirmation evidence after a submit (for verification). */
  confirmation?: Record<string, unknown>;
  simulated: boolean;
}

export interface BrowserProvider {
  key: string;
  /** True once the provider can actually create sessions. */
  isConfigured(): boolean;
  /** Sandbox provider → true; a real remote browser → false. */
  readonly simulated: boolean;
  createSession(args: { objective: string; startUrl?: string }): Promise<BrowserSessionHandle>;
  observe(handle: BrowserSessionHandle, url?: string): Promise<PageObservation>;
  act(handle: BrowserSessionHandle, action: BrowserActionInput): Promise<BrowserActionOutcome>;
  destroySession(handle: BrowserSessionHandle): Promise<void>;
}
