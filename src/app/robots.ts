import type { MetadataRoute } from "next";

/** Public crawl policy: marketing is indexable; the app and APIs are not. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/app/", "/api/", "/checkout"] }],
    sitemap: "https://cosignolabs.com/sitemap.xml",
  };
}
