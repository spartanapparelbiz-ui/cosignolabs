import type { IntegrationProvider } from "./types";
import { githubProvider } from "./providers/github";
import {
  googleProvider,
  notionProvider,
  slackProvider,
} from "./providers/oauth";

/**
 * The provider registry — the single discoverable list of third-party apps.
 * Adding a connector is: implement IntegrationProvider (or call
 * makeOAuthProvider) and add it here. Everything else — connect/callback,
 * storage, refresh, the UI card — is generic and already wired.
 *
 * Custom MCP servers are NOT providers: they're user-defined connections of
 * kind "mcp" and live in their own module (./mcp).
 */
const PROVIDERS: IntegrationProvider[] = [
  githubProvider,
  googleProvider,
  slackProvider,
  notionProvider,
];

const BY_KEY = new Map(PROVIDERS.map((p) => [p.key, p]));

export function getProvider(key: string): IntegrationProvider | undefined {
  return BY_KEY.get(key);
}

export function listProviders(): IntegrationProvider[] {
  return PROVIDERS;
}

/** Client-safe provider metadata for the Connections UI (no secrets, no methods). */
export interface ProviderMeta {
  key: string;
  name: string;
  detail: string;
  authType: string;
  scopeSummary: string;
  /** Whether the server env is set so this can actually be connected. */
  configured: boolean;
  actions: { id: string; summary: string; mutates: boolean }[];
}

export function providerMeta(p: IntegrationProvider): ProviderMeta {
  return {
    key: p.key,
    name: p.name,
    detail: p.detail,
    authType: p.authType,
    scopeSummary: p.scopeSummary,
    configured: p.isConfigured(),
    actions: p.listActions(),
  };
}

export function listProviderMeta(): ProviderMeta[] {
  return PROVIDERS.map(providerMeta);
}
