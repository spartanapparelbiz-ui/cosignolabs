import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "cosigno",
    short_name: "cosigno",
    description:
      "the AI operator that asks first — plans, drafts, and executes across your tools, and nothing moves without your signature.",
    start_url: "/app",
    display: "standalone",
    background_color: "#FBF4EA",
    theme_color: "#FBF4EA",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
