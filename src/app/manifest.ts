import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "cosigno",
    short_name: "cosigno",
    description:
      "the AI operator that asks first — plans, drafts, and executes across your tools, and nothing moves without your signature.",
    start_url: "/app",
    display: "standalone",
    // App icons sit on a cream rounded plate (orange C + ink check). The splash
    // paints the brand ink field behind them; the browser UI stays cream.
    background_color: "#171512",
    theme_color: "#F7F0E5",
    icons: [
      { src: "/icon-32.png?v=5", sizes: "32x32", type: "image/png" },
      { src: "/icon-192.png?v=5", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png?v=5", sizes: "512x512", type: "image/png" },
      // Maskable entries let Android shape the icon to its launcher (circle,
      // squircle) instead of letterboxing it in a white tile. The plate
      // already insets the glyph well inside the 80% safe zone, so the same
      // art serves both purposes.
      { src: "/icon-192.png?v=5", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512.png?v=5", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
