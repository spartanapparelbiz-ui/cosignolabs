/**
 * Security headers on every response.
 *
 * CSP notes:
 *  - no unsafe-eval anywhere.
 *  - script-src 'unsafe-inline' is required by Next.js's bootstrap inline
 *    scripts (App Router); style-src 'unsafe-inline' is
 *    required by Next font/style injection and Tailwind's inlined styles.
 *    Both are documented, deliberate exceptions.
 *  - connect/frame/script sources cover exactly: self, Supabase
 *    (REST + realtime websocket), and Cloudflare Turnstile.
 */
// 'unsafe-eval' is added ONLY in development — Next.js's dev server / Fast
// Refresh relies on eval. Production stays strict (no unsafe-eval), which is
// what ships and what the security requirement covers.
const devEval = process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'";

// The CSP must allow both, or production sign-in/up silently never loads
// (the form sits disabled and the only evidence is a console CSP violation).

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${devEval} https://challenges.cloudflare.com https://js.stripe.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  // Stripe: js.stripe.com serves Stripe.js; api.stripe.com is the Elements
  // tokenization endpoint; the frames host Elements' card iframes + the 3DS
  // challenge. Card data lives only inside those Stripe-owned frames.
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://challenges.cloudflare.com https://api.stripe.com https://js.stripe.com`,
  `frame-src https://challenges.cloudflare.com https://js.stripe.com https://hooks.stripe.com`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Build provenance, stamped into the bundle at build time. COMMIT_REF and
  // BRANCH are set by Netlify's build environment, GITHUB_SHA by CI; both are
  // empty in local dev. /api/health serves these so verify:deploy can prove
  // the LIVE site runs the commit that was just pushed — a deploy pipeline
  // that silently stops publishing looks exactly like a healthy site without
  // this.
  env: {
    BUILD_COMMIT: (process.env.COMMIT_REF || process.env.GITHUB_SHA || "").slice(0, 7),
    BUILD_AT: new Date().toISOString(),
  },
  experimental: {
    // Rewrite barrel imports to direct ones at build time (lucide-react is
    // already in Next's default list; Clerk is added on top). Shrinks the
    // module graph on every route that touches these packages.
    optimizePackageImports: ["@clerk/nextjs"],
    // Client router cache: reuse a dynamic page's RSC payload for 30s, so
    // rail navigation (home ↔ missions ↔ approvals ↔ activity) is instant
    // on back/forward instead of refetching the shell every time. Freshness
    // is unaffected where it matters: every app surface revalidates its own
    // data client-side on mount (the prefetched pages do it SWR-style).
    staleTimes: { dynamic: 30 },
  },
  // instrumentation.ts imports scripts/env-services.mjs, which lives OUTSIDE
  // the app source tree. Explicitly include it in the serverless function
  // bundle so the boot diagnostic can load it on Netlify (belt-and-suspenders
  // with the try/catch in instrumentation.ts).
  outputFileTracingIncludes: {
    "/**": ["./scripts/env-services.mjs"],
  },
  async headers() {
    // Long-lived, immutable caching for the brand-stable static assets the
    // Connections UI leans on — bundled connector logos and app icons. These
    // rarely change (and icons are query-versioned when they do), so the
    // browser can serve them from cache with no re-fetch and no flash/CLS.
    const immutable = [
      {
        key: "Cache-Control",
        value: "public, max-age=31536000, immutable",
      },
    ];
    return [
      { source: "/(.*)", headers: securityHeaders },
      { source: "/logos/:path*", headers: immutable },
      {
        source:
          "/:icon(favicon.svg|favicon.ico|mask-icon.svg|apple-touch-icon.png|icon-16.png|icon-32.png|icon-192.png|icon-512.png)",
        headers: immutable,
      },
    ];
  },
};

export default nextConfig;
