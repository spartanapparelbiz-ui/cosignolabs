import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-static";

/**
 * RFC 9116 security.txt — responsible-disclosure contact for cosigno.
 * Served from the app router so it deploys with the site (no static-dir
 * divergence). Expires is emitted at build/request time, one year out,
 * so the file can never advertise a stale policy window.
 */
export function GET(): NextResponse {
  const site = (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://cosignolabs.com"
  ).replace(/\/$/, "");
  const expires = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
  const body = [
    "Contact: mailto:security@cosignolabs.com",
    `Expires: ${expires}`,
    `Canonical: ${site}/.well-known/security.txt`,
    `Policy: ${site}/security`,
    "Preferred-Languages: en",
    "",
  ].join("\n");
  return new NextResponse(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
