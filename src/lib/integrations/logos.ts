/**
 * Connector logo resolution — pure, no React. Known providers map to a
 * bundled, self-hosted SVG (never a hotlink to the vendor). Custom MCP
 * connections either carry a sanitized, re-encoded raster icon (a data: URI
 * we produced from the server's advertised favicon — see mcp/icon.ts) or fall
 * back to a generated monogram badge. Nothing here ever renders remote markup.
 */

/** Provider keys that ship with a bundled logo in /public/logos. */
const BUNDLED = new Set([
  "github",
  "google",
  "google-calendar",
  "google-drive",
  "outlook",
  "slack",
  "notion",
]);

/** Path to a bundled logo (served static, long-cached), or null. */
export function bundledLogo(providerKey: string): string | null {
  return BUNDLED.has(providerKey) ? `/logos/${providerKey}.svg` : null;
}

export const GENERIC_MCP_LOGO = "/logos/mcp.svg";
export const DEFAULT_LOGO = "/logos/default.svg";

/**
 * Only a raster data: URI we generated is allowed as a custom icon — never
 * SVG (which can carry script), never a remote URL. Anything else is dropped.
 */
export function isSafeIcon(icon: unknown): icon is string {
  return (
    typeof icon === "string" &&
    /^data:image\/(png|jpeg|webp|gif|x-icon|vnd\.microsoft\.icon);base64,[A-Za-z0-9+/=]+$/.test(
      icon
    ) &&
    icon.length < 60_000
  );
}

/** First 1–2 initials for a monogram, from a display name. */
export function initials(name: string): string {
  const words = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (words.length === 0) return "•";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * A generated monogram badge as an SVG data: URI — a cream initial on the
 * brand ink field. We build the SVG ourselves from sanitized text, so it's
 * safe to use as an <img> source. Deterministic (no remote fetch, no CLS).
 */
export function monogram(name: string): string {
  const text = initials(name)
    .replace(/[^A-Z0-9•]/g, "")
    .slice(0, 2) || "•";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#141414"/><text x="20" y="21" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif" font-size="17" font-weight="800" fill="#F8F0E8" text-anchor="middle" dominant-baseline="central">${text}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export interface ResolvedLogo {
  src: string;
  /** true when it's a generated monogram (styling differs slightly). */
  monogram: boolean;
}

/**
 * Resolve the best logo source for a connection. Bundled provider SVG →
 * sanitized custom raster → generated monogram. Never returns a remote URL.
 */
export function resolveLogo(args: {
  kind: "app" | "mcp";
  providerKey: string;
  displayName: string;
  customIcon?: unknown;
}): ResolvedLogo {
  const bundled = bundledLogo(args.providerKey);
  if (bundled) return { src: bundled, monogram: false };
  if (isSafeIcon(args.customIcon)) return { src: args.customIcon, monogram: false };
  // Custom MCP with no safe icon → monogram from its name.
  return { src: monogram(args.displayName || "MCP"), monogram: true };
}
