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
  "/api/health",
  "/api/beta",
  "/api/preview",
  "/api/stripe/webhook",
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
  body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.1rem;padding:2rem;
    background:#FBF4EA;color:#141414;text-align:center;
    font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
  svg{width:56px;height:56px}
  h1{margin:0;font-size:1.6rem;font-weight:800;letter-spacing:-0.01em}
  p{margin:0;max-width:24rem;color:#5C5650;font-weight:600;line-height:1.5}
  a{margin-top:.4rem;color:#141414;font-weight:800;text-decoration:none;
    border:1px solid #141414;border-radius:10px;padding:.6rem 1.2rem}
</style></head>
<body>
  <svg viewBox="0 0 100 100" aria-hidden="true">
    <path d="M 76.0 66.9 A 31 31 0 1 1 76.0 33.1" fill="none" stroke="#141414" stroke-width="26" stroke-linecap="round"/>
    <path d="M 47 53 L 57 63 L 88 28" fill="none" stroke="#FF4B1F" stroke-width="17" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
  <h1>cosigno is warming up</h1>
  <p>the workspace is being configured — back shortly. the rest of the site works right now.</p>
  <a href="/">back to home</a>
</body></html>`;

function clerkConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY
  );
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
    "/api((?!/health$|/beta$|/preview$|/stripe/webhook$).*)",
  ]);
  return clerkMiddleware(async (auth, req) => {
    if (isProtected(req)) await auth.protect();
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
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
