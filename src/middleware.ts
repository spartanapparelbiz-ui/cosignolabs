import { NextResponse } from "next/server";
import type { NextFetchEvent, NextMiddleware, NextRequest } from "next/server";

const hasClerk = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY
);

/**
 * With Clerk configured, /app and its APIs require a signed-in user.
 * Without Clerk (local dev / demo mode) requests pass through and the
 * server maps everything to a single demo user.
 */
async function buildMiddleware(): Promise<NextMiddleware> {
  if (!hasClerk) {
    return () => NextResponse.next();
  }
  const { clerkMiddleware, createRouteMatcher } = await import(
    "@clerk/nextjs/server"
  );
  const isProtected = createRouteMatcher(["/app(.*)", "/api((?!/beta|/stripe).*)"]);
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
