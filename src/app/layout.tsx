import type { Metadata } from "next";
import { Nunito_Sans } from "next/font/google";
import "./globals.css";

const nunito = Nunito_Sans({
  subsets: ["latin"],
  variable: "--font-nunito",
  weight: ["400", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://cosignolabs.com"),
  title: "cosigno — the AI operator that asks first",
  description:
    "Cosigno plans, drafts, and executes across your tools — and nothing moves without your signature.",
  openGraph: {
    title: "cosigno — the AI operator that asks first",
    description:
      "Cosigno plans, drafts, and executes across your tools — and nothing moves without your signature.",
    url: "https://cosignolabs.com",
    siteName: "cosigno",
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
