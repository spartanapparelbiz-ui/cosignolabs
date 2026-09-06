import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Inter, Libre_Bodoni, Source_Serif_4 } from "next/font/google";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

/**
 * The type system: four voices, each with one job (see BRAND.md).
 *
 *   interface  Inter            everything you read to operate the product
 *   display    Source Serif 4   headlines, prices, counters — the stated word
 *   wordmark   Libre Bodoni 500 the logotype, and nothing else
 *   record     IBM Plex Mono    payloads, ids, timestamps — the exact word
 *
 * All four are self-hosted by next/font (no runtime request to Google, nothing
 * for a third party to log), `display: "swap"` with `adjustFontFallback` so the
 * fallback is metric-matched and the swap costs no layout shift. The two faces
 * that carry many weights ship as one variable file each, and the two that
 * carry one or two ship only those, which is why a four-face system costs less
 * on the wire (133 KB of latin) than the three-face one it replaces (236 KB).
 */

// Interface. The workhorse: this UI leans hard on 10–13px labels, tabular
// figures and tight lowercase, which is exactly what Inter was drawn for.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
  adjustFontFallback: true,
});

// Display. A sober text serif: institutional rather than expressive, because
// this page is asking to be trusted with a signature. The face also carries an
// optical-size axis, but shipping it costs 71 KB on the latin subset for a
// refinement nobody would name, so only the weight axis is requested.
const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  fallback: ["Georgia", "serif"],
  adjustFontFallback: true,
});

// Wordmark. A didone: hairline-to-stem contrast and ball terminals, so the
// logotype carries the composure the mark's single flat shape deliberately
// leaves to it. Used ONLY by the wordmark, and only at 500, so that is the only
// weight shipped.
const libreBodoni = Libre_Bodoni({
  subsets: ["latin"],
  variable: "--font-wordmark",
  weight: ["500"],
  display: "swap",
  fallback: ["Georgia", "serif"],
  adjustFontFallback: true,
});

// The record. Every payload, id, amount and timestamp in the product is set in
// mono, and until now that meant Menlo on one machine and Consolas on the next.
// Naming the face makes the audit trail look the same everywhere it is read.
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "700"],
  display: "swap",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
  adjustFontFallback: true,
});

const FONT_VARS = [inter, sourceSerif, libreBodoni, plexMono].map((f) => f.variable).join(" ");

const DESCRIPTION =
  "give cosigno a task, review the important actions, and let it handle the work across your connected tools. nothing sends, changes, or spends until you approve it.";

export const metadata: Metadata = {
  metadataBase: new URL("https://cosignolabs.com"),
  // A template, so every page reads "<Page> • cosigno" in the tab without
  // each route restating the brand. `default` covers routes that set none.
  title: {
    default: "cosigno: the AI operator that asks first",
    template: "%s • cosigno",
  },
  description: DESCRIPTION,
  applicationName: "cosigno",
  alternates: { canonical: "https://cosignolabs.com" },
  icons: {
    // The rebranded mark: one orange shape with its counter knocked out, so a
    // single file reads on a light OR a dark tab bar with no theme rule. App
    // icons sit on a cream rounded plate. ?v=6 busts the previous mark's cached
    // icons. SVG first (crispest), then .ico, then PNGs.
    icon: [
      { url: "/favicon.svg?v=6", type: "image/svg+xml" },
      { url: "/favicon.ico?v=6", sizes: "any" },
      { url: "/icon-16.png?v=6", type: "image/png", sizes: "16x16" },
      { url: "/icon-32.png?v=6", type: "image/png", sizes: "32x32" },
      { url: "/icon-192.png?v=6", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png?v=6", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-touch-icon.png?v=6", sizes: "180x180" }],
    other: [{ rel: "mask-icon", url: "/mask-icon.svg?v=6", color: "#FB4C20" }],
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    title: "cosigno: the AI operator that asks first",
    description: DESCRIPTION,
    url: "https://cosignolabs.com",
    siteName: "cosigno",
    images: [{ url: "/og.png?v=6", width: 1200, height: 630, alt: "cosigno" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "cosigno: the AI operator that asks first",
    description: DESCRIPTION,
    images: ["/og.png?v=6"],
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
    <html lang="en" className={FONT_VARS} suppressHydrationWarning>
      <head>
        {/* Set the theme before first paint so there's no flash of the wrong
            palette. Reads the saved preference (or the OS setting). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
