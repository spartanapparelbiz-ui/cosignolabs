import type { BrowserProvider } from "./provider";
import { SandboxBrowserProvider } from "./sandbox";

/**
 * Browser-provider resolution. A real remote provider (Browserbase / Steel /
 * self-hosted Playwright grid) is used ONLY when its env is configured;
 * otherwise the sandbox provider drives the loop with clearly-labeled
 * fixtures. There is no silent middle ground: either a live provider is
 * present (real pages, real prices) or everything is marked simulated.
 *
 * The real provider is a documented seam — construct it from env here when
 * BROWSER_PROVIDER_URL + BROWSER_PROVIDER_KEY are set. Until then, isLiveBrowser
 * is false and the deployment health page says so, so no user is promised
 * live browsing that isn't wired.
 */

const sandbox = new SandboxBrowserProvider();

export function browserProviderConfigured(): boolean {
  return Boolean(process.env.BROWSER_PROVIDER_URL?.trim() && process.env.BROWSER_PROVIDER_KEY?.trim());
}

/** True when real, live browser sessions are available. */
export function isLiveBrowser(): boolean {
  // A RemoteBrowserProvider plugs in here once configured. Kept explicit so
  // the health page and compiler read the same source of truth.
  return browserProviderConfigured() && false; // no remote provider wired yet
}

export function getBrowserProvider(): BrowserProvider {
  // When a remote provider is implemented and configured, return it here.
  return sandbox;
}

export { sandbox as sandboxBrowserProvider };
