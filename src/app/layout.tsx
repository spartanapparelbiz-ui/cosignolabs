import type { Metadata, Viewport } from "next";
import { Nunito_Sans } from "next/font/google";
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

const DESCRIPTION =
  "cosigno plans, drafts, and executes across your tools — and nothing moves without your signature.";

export const metadata: Metadata = {
  metadataBase: new URL("https://cosignolabs.com"),
  title: "cosigno — the AI operator that asks first",
  description: DESCRIPTION,
  applicationName: "cosigno",
  alternates: { canonical: "https://cosignolabs.com" },
  icons: {
    // Icon set = a bold ink tile (cream C + orange check) that reads on light
    // AND dark tab bars. The ?v=2 query busts old cached (transparent) icons.
    // SVG first (crispest where supported), then the multi-res .ico, then PNGs.
    icon: [
      { url: "/favicon.svg?v=2", type: "image/svg+xml" },
      { url: "/favicon.ico?v=2", sizes: "any" },
      { url: "/icon-16.png?v=2", type: "image/png", sizes: "16x16" },
      { url: "/icon-32.png?v=2", type: "image/png", sizes: "32x32" },
      { url: "/icon-192.png?v=2", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png?v=2", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-touch-icon.png?v=2", sizes: "180x180" }],
    other: [{ rel: "mask-icon", url: "/mask-icon.svg", color: "#141414" }],
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
    { media: "(prefers-color-scheme: light)", color: "#FBF4EA" },
    { media: "(prefers-color-scheme: dark)", color: "#141414" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={nunito.variable}>
      <body>{children}</body>
    </html>
  );
}
