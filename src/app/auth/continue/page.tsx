import type { Metadata } from "next";
import { ConfirmContinue } from "@/components/auth/ConfirmContinue";
import { safeRedirect } from "@/components/auth/authRedirect";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "confirming — cosigno",
  robots: { index: false, follow: false },
};

/**
 * Fragment-carrying confirmation links land here from /auth/confirm. All the
 * work is client-side by necessity — the fragment never reaches a server.
 */
export default async function AuthContinuePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <ConfirmContinue next={safeRedirect(next)} />;
}
