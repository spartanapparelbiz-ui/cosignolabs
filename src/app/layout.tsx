import type { Metadata } from "next";
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
    icon: [
      // SVG first: dark-tab-adaptive (prefers-color-scheme) where supported.
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: "/apple-touch-icon.png",
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
