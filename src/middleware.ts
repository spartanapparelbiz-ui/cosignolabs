import { NextResponse } from "next/server";
import type { NextFetchEvent, NextMiddleware, NextRequest } from "next/server";

/**
 * Deny-by-default edge gate.
 *
 * Marketing surfaces are ALWAYS public, in every environment, with zero env
 * vars: the landing page (/), pricing (/pricing), the live preview API
 * (/api/preview — mock planner only, never touches real providers), the
 * health check, and the Stripe webhook stub (verifies its own signature).
 *
 * Fail-closed applies ONLY to /app/* and the non-preview API routes: in
 * production with missing keys those never fall back to demo mode. Page
 * navigations get a branded 503 ("cosigno is warming up"); API routes get a
 * clean JSON 503. Demo mode is unreachable in production.
 */

const PUBLIC_PATHS = new Set([
  "/",
  "/pricing",
  "/terms",
  "/privacy",
  "/sign-in",
  "/sign-up",
  "/api/health",
  "/api/beta",
  "/api/preview",
  "/api/stripe/webhook",
  // Anonymous analytics beacon — landing visitors have no session by design.
  // Rate-limited + allowlist-validated in the route; needs no keys.
  "/api/track",
]);

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname);
}

/**
 * Branded "warming up" page served for /app/* navigations when production
 * keys are missing. Self-contained (inline styles + mark) so it renders at
 * the edge with no imports and no env. Mirrors the brand tokens.
 */
const WARMING_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>cosigno — warming up</title>
<meta name="robots" content="noindex"/>
<style>
  :root{color-scheme:light}
  *{box-sizing:border-box}
  html{-webkit-text-size-adjust:100%}
  body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.15rem;padding:2rem;
    background:#F8F0E8;color:#141414;text-align:center;
    font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    -webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility}
  svg{width:56px;height:56px;display:block}
  h1{margin:0;font-size:1.7rem;font-weight:800;letter-spacing:-0.02em;line-height:1.15}
  p{margin:0;max-width:26rem;color:#5C5650;font-weight:500;font-size:1rem;line-height:1.55}
  a{margin-top:.5rem;color:#141414;font-weight:700;text-decoration:none;
    border:1.5px solid #141414;border-radius:10px;padding:.65rem 1.3rem;
    transition:background .15s ease,color .15s ease}
  a:hover{background:#141414;color:#F8F0E8}
  /* living logo: the mark breathes even here (transform/opacity only) */
  @keyframes breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.015)}}
  @keyframes tick{0%,100%{opacity:.92}50%{opacity:1}}
  svg{animation:breathe 5s ease-in-out infinite;transform-origin:center}
  svg .tick{animation:tick 5s ease-in-out infinite}
  @media (prefers-reduced-motion:reduce){svg,svg .tick{animation:none}}
</style></head>
<body>
  <svg viewBox="0 0 160 160" aria-hidden="true">
    <path d="M 70.5 16.44 C 57.77 18.37, 48.31 22.33, 38.54 29.81 C 21.17 43.11, 11 66.97, 13.93 87.6 C 15.73 100.3, 20.58 111.26, 28.77 121.1 C 36.28 130.12, 45.93 136.74, 57.35 140.71 C 63.74 142.94, 68.73 143.86, 76.25 144.19 C 98.96 145.2, 120.62 134.14, 133.15 115.13 C 136.96 109.34, 137.35 108.43, 137.09 105.75 C 136.93 104.12, 136.53 103.08, 135.73 102.31 C 134.56 101.17, 120.58 94.48, 119.35 94.48 C 117.11 94.48, 115.46 95.92, 112.37 100.55 C 108.24 106.77, 103.78 110.86, 97.8 113.91 C 91.25 117.27, 87.7 118.24, 80.92 118.55 C 71.49 118.99, 63.88 116.93, 56.43 111.95 C 50.48 107.97, 46.21 103.19, 43.25 97.2 C 40.26 91.14, 39.38 87.93, 39.07 81.86 C 38.53 71.6, 42.24 61.96, 49.83 53.95 C 61.7 41.4, 80.68 37.99, 96.16 45.6 C 98.26 46.63, 100.14 47.48, 100.35 47.48 C 100.55 47.48, 103.39 45.56, 106.65 43.22 C 109.91 40.88, 114.7 37.64, 117.3 36.02 C 119.89 34.4, 122.02 32.92, 122.02 32.72 C 122.02 31.8, 113.87 25.97, 109.22 23.56 C 103.29 20.47, 101.83 19.91, 94.72 17.97 C 89.97 16.68, 88.7 16.54, 80.71 16.39 C 75.88 16.3, 71.29 16.32, 70.5 16.44" fill="#FB4C20"/>
    <path class="tick" d="M 141.25 35.34 C 124.28 41.92, 104.95 55.37, 86.12 73.71 C 82.43 77.3, 79.24 80.24, 79.03 80.24 C 78.82 80.24, 75.74 77.39, 72.2 73.9 C 65.01 66.83, 63.97 66.25, 59.07 66.56 C 56.67 66.71, 55.63 67.04, 54.02 68.17 C 51.22 70.13, 49.65 73.11, 49.63 76.47 C 49.61 79.78, 50.62 81.43, 57.24 88.87 C 59.87 91.83, 64.17 96.82, 66.8 99.97 C 69.43 103.12, 72.14 106.06, 72.82 106.5 C 75.05 107.97, 78.47 108.48, 81.49 107.8 C 84.76 107.07, 85.83 106.06, 99.03 91.16 C 114.24 73.98, 131.81 54.32, 139.69 45.63 C 143.81 41.08, 147.18 37, 147.18 36.56 C 147.18 35.6, 145.72 34.17, 144.77 34.21 C 144.4 34.22, 142.81 34.73, 141.25 35.34" fill="#171512"/>
  </svg>
  <h1>cosigno is warming up</h1>
  <p>the workspace is being configured &mdash; back shortly.<br/>the rest of the site works right now &mdash; including the full demo.</p>
  <a href="/demo">try the demo dashboard</a>
  <a href="/">back to home</a>
</body></html>`;

function authConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

/** Cheap edge check: does the request carry a Supabase auth session cookie? */
function hasAuthCookie(req: NextRequest): boolean {
  return req.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
}

// --- public sandbox (COSIGNO_PUBLIC_MODE=1) guest identity, inlined so the
// edge gate stays import-light and vendor-free (mirrors publicMode.ts). ---
const GUEST_COOKIE = "cosigno_guest";
const GUEST_HEADER = "x-cosigno-guest";
const GUEST_RE = /^guest_[0-9a-f]{32}$/;

function publicSandbox(): boolean {
  return process.env.COSIGNO_PUBLIC_MODE === "1";
}

function newGuestId(): string {
  return "guest_" + crypto.randomUUID().replace(/-/g, "");
}

/**
 * Let an anonymous visitor into the sandbox: ensure a valid guest id, forward
 * it as a request header (so THIS request already resolves it), and persist it
 * as an httpOnly cookie. Marketing paths pass through untouched.
 */
function guestGate(req: NextRequest): NextResponse {
  if (isPublic(req.nextUrl.pathname) && req.nextUrl.pathname !== "/api/beta") {
    return NextResponse.next();
  }
  const existing = req.cookies.get(GUEST_COOKIE)?.value;
  const id = existing && GUEST_RE.test(existing) ? existing : newGuestId();
  const headers = new Headers(req.headers);
  headers.set(GUEST_HEADER, id);
  const res = NextResponse.next({ request: { headers } });
  res.cookies.set(GUEST_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // a week; the sandbox itself is ephemeral
  });
  return res;
}

function productionReady(): boolean {
  // Coarse edge gate for /app pages. The authoritative fail-closed check is
  // env.ts → provider (which honors the one-release legacy planner key); this
  // page gate uses the current key name only, kept vendor-free + edge-safe.
  return [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "PLANNER_API_KEY",
  ].every((k) => process.env[k]);
}

async function buildMiddleware(): Promise<NextMiddleware> {
  const prod = process.env.NODE_ENV === "production";

  if (prod && !productionReady() && publicSandbox()) {
    // Opt-in public sandbox: no real keys, but anyone can try cosigno. Each
    // visitor gets an isolated guest id; the store is in-memory, the planner
    // offline, connectors sandbox-only — no real accounts, data, or actions.
    return (req: NextRequest) => guestGate(req);
  }

  if (prod && !productionReady()) {
    // Fail closed: protected surfaces 503, never a silent demo fallback.
    // Marketing surfaces (landing, pricing, preview, health, webhook) stay
    // public; beta submit needs the store so it 503s with the rest.
    return (req: NextRequest) => {
      const path = req.nextUrl.pathname;
      if (isPublic(path) && path !== "/api/beta") {
        return NextResponse.next();
      }
      if (path.startsWith("/api/")) {
        return NextResponse.json(
          { error: "not_configured", message: "Cosigno is warming up — back shortly." },
          { status: 503 }
        );
      }
      // Page navigation (e.g. /app/*): a branded HTML page, not a raw error.
      return new NextResponse(WARMING_HTML, {
        status: 503,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    };
  }

  if (!authConfigured()) {
    // Development demo mode only — production is handled above.
    return () => NextResponse.next();
  }

  const { createServerClient } = await import("@supabase/ssr");
  const PUBLIC_API = new Set([
    "/api/health",
    "/api/beta",
    "/api/preview",
    "/api/stripe/webhook",
    "/api/track",
    "/api/automations/tick",
    "/api/missions/tick",
  ]);
  const isProtected = (path: string) =>
    path.startsWith("/app") ||
    path.startsWith("/checkout") ||
    // /api/v1/* is the authorization API for agents: it authenticates with an
    // API key, never a browser session, so the cookie gate must not run on it.
    // Each v1 route still enforces its own auth (API key, or a session for the
    // dev-only key bootstrap) — this exempts the cookie check, not the check.
    (path.startsWith("/api/") && !path.startsWith("/api/v1/") && !PUBLIC_API.has(path));

  return async (req: NextRequest) => {
    const path = req.nextUrl.pathname;

    // Signed-in visitors hitting the homepage go straight to the app — the
    // dashboard is one click (zero, here) away. Cookie presence only; the
    // real session check happens on /app itself.
    if (path === "/") {
      return hasAuthCookie(req)
        ? NextResponse.redirect(new URL("/app", req.url))
        : NextResponse.next();
    }

    // Verify (and refresh) the Supabase session; refreshed cookies ride on
    // the response so sessions persist without client round-trips.
    let res = NextResponse.next({ request: { headers: req.headers } });
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => req.cookies.getAll(),
          setAll: (toSet) => {
            res = NextResponse.next({ request: { headers: req.headers } });
            for (const { name, value, options } of toSet) {
              res.cookies.set(name, value, options);
            }
          },
        },
      }
    );
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user || !isProtected(path)) return res;

    // Logged out on a protected surface. APIs get a clean JSON 401; page
    // navigations go to our branded /sign-in with the destination preserved.
    if (path.startsWith("/api/")) {
      return NextResponse.json(
        { error: "unauthorized", message: "Sign in to continue." },
        { status: 401 }
      );
    }
    const signIn = new URL("/sign-in", req.url);
    signIn.searchParams.set("redirect_url", path + req.nextUrl.search);
    return NextResponse.redirect(signIn);
  };
}

const middlewarePromise = buildMiddleware();

export default async function middleware(
  req: NextRequest,
  event: NextFetchEvent
) {
  const mw = await middlewarePromise;
  return mw(req, event);
}

export const config = {
  // CRITICAL ACCESS RULE: middleware runs ONLY on protected surfaces. The
  // public marketing site (/, /product, /security, /pricing, /templates,
  // /privacy, /terms, the auth pages, metadata routes, static assets, OG
  // images) never touches middleware at all — so auth can never handshake,
  // redirect, or 503 an anonymous visitor. Protection lives exactly where
  // the product needs it: the app, checkout, and the non-public APIs.
  // "/" is matched ONLY for the signed-in → /app shortcut (cookie check, no
  // vendor code, no auth handshake); every other marketing path stays outside.
  matcher: ["/", "/app/:path*", "/checkout/:path*", "/api/:path*"],
};
