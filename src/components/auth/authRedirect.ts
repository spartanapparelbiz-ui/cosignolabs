/**
 * Sanitize a post-auth redirect target. Only same-origin, path-absolute URLs
 * are honoured ("/app", "/app/account"); anything else — a protocol-relative
 * "//evil.com", an absolute URL, or junk — falls back to the workspace. This is
 * the open-redirect guard for the `redirect_url` query param that middleware
 * appends when it bounces a logged-out visitor here.
 */
export function safeRedirect(raw: string | undefined | null): string {
  const fallback = "/app";
  if (!raw) return fallback;
  // must start with a single "/" and not "//" (protocol-relative) or "/\"
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return fallback;
  }
  return raw;
}

/** Preserve the redirect target when linking between sign-in and sign-up. */
export function withRedirect(path: string, dest: string): string {
  return dest && dest !== "/app"
    ? `${path}?redirect_url=${encodeURIComponent(dest)}`
    : path;
}
