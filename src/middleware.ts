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
  "/sso-callback",
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
    background:#FBF4EA;color:#141414;text-align:center;
    font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    -webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility}
  svg{width:56px;height:56px;display:block}
  h1{margin:0;font-size:1.7rem;font-weight:800;letter-spacing:-0.02em;line-height:1.15}
  p{margin:0;max-width:26rem;color:#5C5650;font-weight:500;font-size:1rem;line-height:1.55}
  a{margin-top:.5rem;color:#141414;font-weight:700;text-decoration:none;
    border:1.5px solid #141414;border-radius:10px;padding:.65rem 1.3rem;
    transition:background .15s ease,color .15s ease}
  a:hover{background:#141414;color:#FBF4EA}
  /* living logo: the mark breathes even here (transform/opacity only) */
  @keyframes breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.015)}}
  @keyframes tick{0%,100%{opacity:.92}50%{opacity:1}}
  svg{animation:breathe 5s ease-in-out infinite;transform-origin:center}
  svg .tick{animation:tick 5s ease-in-out infinite}
  @media (prefers-reduced-motion:reduce){svg,svg .tick{animation:none}}
</style></head>
<body>
  <svg viewBox="0 0 160 160" aria-hidden="true">
    <path d="M112 35C91 17 59 17 37 37C13 59 13 101 37 123C59 143 91 143 112 125" fill="none" stroke="#FF4B22" stroke-width="22" stroke-linecap="round"/>
    <path class="tick" d="M44 81L69 106L121 54" fill="none" stroke="#171512" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
  <h1>cosigno is warming up</h1>
  <p>the workspace is being configured &mdash; back shortly.<br/>the rest of the site works right now &mdash; including the full demo.</p>
  <a href="/demo">try the demo dashboard</a>
  <a href="/">back to home</a>
</body></html>`;

function clerkConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY
  );
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
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    "CLERK_SECRET_KEY",
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
          { error: "not_configured", message: "cosigno is warming up — back shortly." },
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

  if (!clerkConfigured()) {
    // Development demo mode only — production is handled above.
    return () => NextResponse.next();
  }

  const { clerkMiddleware, createRouteMatcher } = await import(
    "@clerk/nextjs/server"
  );
  const isProtected = createRouteMatcher([
    "/app(.*)",
    "/checkout(.*)",
    "/api((?!/health$|/beta$|/preview$|/stripe/webhook$|/track$|/automations/tick$|/missions/tick$).*)",
  ]);
  return clerkMiddleware(async (auth, req) => {
    if (!isProtected(req)) return;
    const { userId } = await auth();
    if (userId) return; // signed in → let it through

    // Logged out on a protected surface. APIs get a clean JSON 401; page
    // navigations go to our branded /sign-in with the destination preserved
    // (never Clerk's hosted page).
    const path = req.nextUrl.pathname;
    if (path.startsWith("/api/")) {
      return NextResponse.json(
        { error: "unauthorized", message: "sign in to continue." },
        { status: 401 }
      );
    }
    const signIn = new URL("/sign-in", req.url);
    signIn.searchParams.set("redirect_url", path + req.nextUrl.search);
    return NextResponse.redirect(signIn);
  }) as unknown as NextMiddleware;
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
  // images) never touches middleware at all — so Clerk can never handshake,
  // redirect, or 503 an anonymous visitor. Protection lives exactly where
  // the product needs it: the app, checkout, and the non-public APIs.
  matcher: ["/app/:path*", "/checkout/:path*", "/api/:path*"],
};
