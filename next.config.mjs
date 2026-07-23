/**
 * Security headers on every response.
 *
 * CSP notes:
 *  - no unsafe-eval anywhere.
 *  - script-src 'unsafe-inline' is required by Next.js's bootstrap inline
 *    scripts (App Router) and Clerk's loader; style-src 'unsafe-inline' is
 *    required by Next font/style injection and Tailwind's inlined styles.
 *    Both are documented, deliberate exceptions.
 *  - connect/frame/script sources cover exactly: self, Clerk, Supabase
 *    (REST + realtime websocket), and Cloudflare Turnstile.
 */
// 'unsafe-eval' is added ONLY in development — Next.js's dev server / Fast
// Refresh relies on eval. Production stays strict (no unsafe-eval), which is
// what ships and what the security requirement covers.
const devEval = process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'";

// Clerk lives on TWO different hosts depending on the instance:
//  - development instances: https://<slug>.clerk.accounts.dev
//  - PRODUCTION instances: a subdomain of OUR domain, https://clerk.cosignolabs.com
// The CSP must allow both, or production sign-in/up silently never loads
// (the form sits disabled and the only evidence is a console CSP violation).
const clerkHosts =
  "https://*.clerk.accounts.dev https://clerk.cosignolabs.com";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${devEval} ${clerkHosts} https://challenges.cloudflare.com https://js.stripe.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://img.clerk.com",
  "font-src 'self' data:",
  // Stripe: js.stripe.com serves Stripe.js; api.stripe.com is the Elements
  // tokenization endpoint; the frames host Elements' card iframes + the 3DS
  // challenge. Card data lives only inside those Stripe-owned frames.
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co ${clerkHosts} https://clerk-telemetry.com https://challenges.cloudflare.com https://api.stripe.com https://js.stripe.com`,
  `frame-src https://challenges.cloudflare.com ${clerkHosts} https://js.stripe.com https://hooks.stripe.com`,
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
  // Cross-origin isolation posture. COOP severs window references from other
  // origins (Stripe/Clerk/Turnstile use iframes + redirects, not window
  // handles, so same-origin is compatible). CORP stops other origins from
  // embedding our resources; same-origin is safe because all product assets
  // are consumed same-origin only.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
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
