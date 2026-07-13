import type { Metadata } from "next";
import { clerkConfigured } from "@/lib/auth";
import { isProduction, publicSandboxActive } from "@/lib/env";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { safeRedirect } from "@/components/auth/authRedirect";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "sign in — cosigno",
  robots: { index: false, follow: false },
};

function googleEnabled(): boolean {
  const v = process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH;
  return v === "1" || v === "true";
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string }>;
}) {
  const { redirect_url } = await searchParams;
  return (
    <AuthScreen
      mode="sign-in"
      clerkEnabled={clerkConfigured()}
      googleEnabled={googleEnabled()}
      dest={safeRedirect(redirect_url)}
      demoAllowed={!isProduction() || publicSandboxActive()}
    />
  );
}
