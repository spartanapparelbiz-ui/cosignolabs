import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "cosigno",
    short_name: "cosigno",
    description:
      "the AI operator that asks first — plans, drafts, and executes across your tools, and nothing moves without your signature.",
    start_url: "/app",
    display: "standalone",
    // Transparent icons; the install splash paints the brand ink field behind
    // the mark, the browser UI stays cream. (No maskable variant — a
    // transparent icon isn't a good Android adaptive-mask candidate.)
    background_color: "#141414",
    theme_color: "#FBF4EA",
    icons: [
      { src: "/icon-32.png?v=3", sizes: "32x32", type: "image/png" },
      { src: "/icon-192.png?v=3", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png?v=3", sizes: "512x512", type: "image/png" },
    ],
  };
}
