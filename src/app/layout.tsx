import type { Metadata, Viewport } from "next";
import { Fraunces, Nunito_Sans, Poppins } from "next/font/google";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

// Self-hosted by next/font (no external request at runtime), display: swap,
// with size-adjust fallback metrics so the swap causes no layout shift.
const nunito = Nunito_Sans({
  subsets: ["latin"],
  variable: "--font-nunito",
  weight: ["400", "600", "700", "800", "900"],
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
  adjustFontFallback: true,
});

// Display face for headlines — a characterful soft-serif that differentiates
// cosigno from the sans-everything indie-AI-SaaS default. Payloads stay in mono
// (the product's exact, auditable voice); body stays in the sans above.
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["600", "700"],
  display: "swap",
  fallback: ["Georgia", "serif"],
  adjustFontFallback: true,
});

// Wordmark face — a geometric sans (perfect-circle bowls, single-story g) that
// matches the cosigno logo identity. Used ONLY by the wordmark, not body text.
const poppins = Poppins({
  subsets: ["latin"],
  variable: "--font-wordmark",
  weight: ["700", "800", "900"],
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
  adjustFontFallback: true,
});

const DESCRIPTION =
  "give cosigno a task, review the important actions, and let it handle the work across your connected tools. nothing sends, changes, or spends until you approve it.";

export const metadata: Metadata = {
  metadataBase: new URL("https://cosignolabs.com"),
  title: "cosigno — the AI operator that asks first",
  description: DESCRIPTION,
  applicationName: "cosigno",
  alternates: { canonical: "https://cosignolabs.com" },
  icons: {
    // Rebranded C + integrated check (no dot). The SVG favicon adapts the check
    // ink→cream by OS theme; the orange C reads on any tab bar. App icons sit on
    // a cream rounded plate. ?v=5 busts the old cached icons. SVG first
    // (crispest + adaptive), then .ico, then PNGs.
    icon: [
      { url: "/favicon.svg?v=5", type: "image/svg+xml" },
      { url: "/favicon.ico?v=5", sizes: "any" },
      { url: "/icon-16.png?v=5", type: "image/png", sizes: "16x16" },
      { url: "/icon-32.png?v=5", type: "image/png", sizes: "32x32" },
      { url: "/icon-192.png?v=5", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png?v=5", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-touch-icon.png?v=5", sizes: "180x180" }],
    other: [{ rel: "mask-icon", url: "/mask-icon.svg?v=5", color: "#FB4C20" }],
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    title: "cosigno — the AI operator that asks first",
    description: DESCRIPTION,
    url: "https://cosignolabs.com",
    siteName: "cosigno",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "cosigno" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "cosigno — the AI operator that asks first",
    description: DESCRIPTION,
    images: ["/og.png"],
  },
};

// Browser UI (mobile address bar / task switcher) tints to the surface the
// visitor is actually looking at: cream in light, ink in dark.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F8F0E8" },
    { media: "(prefers-color-scheme: dark)", color: "#141414" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${nunito.variable} ${fraunces.variable} ${poppins.variable}`} suppressHydrationWarning>
      <head>
        {/* Set the theme before first paint so there's no flash of the wrong
            palette. Reads the saved preference (or the OS setting). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
