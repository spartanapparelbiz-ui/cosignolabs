import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "cosigno",
    short_name: "cosigno",
    description:
      "the AI operator that asks first — plans, drafts, and executes across your tools, and nothing moves without your signature.",
    start_url: "/app",
    display: "standalone",
    // The install splash uses the ink tile's field; the browser UI stays cream.
    background_color: "#141414",
    theme_color: "#FBF4EA",
    icons: [
      { src: "/icon-32.png?v=2", sizes: "32x32", type: "image/png" },
      { src: "/icon-192.png?v=2", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png?v=2", sizes: "512x512", type: "image/png" },
      // The ink tile has a built-in safe zone, so it doubles as a maskable
      // (Android adaptive) icon without a separate asset.
      { src: "/icon-512.png?v=2", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
