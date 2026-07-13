import type { BrowserProvider } from "./provider";
import { SandboxBrowserProvider } from "./sandbox";
import { RemoteBrowserProvider } from "./remote";

/**
 * Browser-provider resolution. The real remote provider (any Browserless-v2-
 * compatible rendering service) is used ONLY when BROWSER_PROVIDER_URL +
 * BROWSER_PROVIDER_KEY are set; otherwise the sandbox provider drives the loop
 * with clearly-labeled fixtures. There is no silent middle ground: either a
 * live provider is present (real pages, real prices) or everything is marked
 * simulated — the health page, compiler, and receipts all read this one truth.
 */

const sandbox = new SandboxBrowserProvider();
const remote = new RemoteBrowserProvider();

export function browserProviderConfigured(): boolean {
  return Boolean(process.env.BROWSER_PROVIDER_URL?.trim() && process.env.BROWSER_PROVIDER_KEY?.trim());
}

/** True when real, live browser sessions are available. */
export function isLiveBrowser(): boolean {
  return remote.isConfigured();
}

export function getBrowserProvider(): BrowserProvider {
  return remote.isConfigured() ? remote : sandbox;
}

export { sandbox as sandboxBrowserProvider, remote as remoteBrowserProvider };
