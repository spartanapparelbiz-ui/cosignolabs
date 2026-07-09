import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { clerkConfigured } from "@/lib/auth";
import { SsoCallbackClient } from "@/components/auth/SsoCallbackClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "signing you in — cosigno",
  robots: { index: false, follow: false },
};

export default function SsoCallbackPage() {
  // Only reachable in a real OAuth flow; with Clerk off there's nothing to
  // complete, so send them to the workspace (demo) directly.
  if (!clerkConfigured()) redirect("/app");
  return <SsoCallbackClient />;
}
