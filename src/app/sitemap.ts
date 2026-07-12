import type { MetadataRoute } from "next";

const BASE = "https://cosignolabs.com";

/** The public, indexable surface. App routes are deliberately absent. */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${BASE}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/product`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE}/demo`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE}/operators`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/templates`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/security`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/pricing`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
