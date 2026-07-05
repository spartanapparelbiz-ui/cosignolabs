import { NextResponse } from "next/server";
import type { NextFetchEvent, NextMiddleware, NextRequest } from "next/server";

/**
 * Deny-by-default edge gate.
 *
 * Public allowlist (nothing else): the landing page, the beta application
 * submit, the health check, and the Stripe webhook stub (which verifies its
 * own signature / returns 501 unconfigured).
 *
 * Everything under /app and /api requires a Clerk session. In production
 * with missing keys the middleware serves 503 for all protected surfaces —
 * demo mode is unreachable.
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

function clerkConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY
  );
}

function productionReady(): boolean {
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
    return (req: NextRequest) => {
      if (isPublic(req.nextUrl.pathname) && req.nextUrl.pathname !== "/api/beta") {
        return NextResponse.next();
      }
      return NextResponse.json(
        { error: "not_configured", message: "Service temporarily unavailable." },
        { status: 503 }
      );
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
