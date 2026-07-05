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

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${devEval} https://*.clerk.accounts.dev https://challenges.cloudflare.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://img.clerk.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.clerk.accounts.dev https://clerk-telemetry.com https://challenges.cloudflare.com",
  "frame-src https://challenges.cloudflare.com https://*.clerk.accounts.dev",
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
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
