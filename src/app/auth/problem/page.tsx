import type { Metadata } from "next";
import { ConfirmProblem } from "@/components/auth/ConfirmProblem";
import { safeRedirect } from "@/components/auth/authRedirect";
import type { ConfirmFailure } from "@/lib/supabaseAuth/confirmFlow";
import { confirmDiagnosis } from "@/lib/supabaseAuth/confirmDiagnosis";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "confirmation problem — cosigno",
  robots: { index: false, follow: false },
};

const REASONS: ConfirmFailure[] = [
  "expired",
  "no_credential",
  "verify_failed",
  "access_denied",
  "not_configured",
];

/** A named, actionable confirmation failure — never a silent bounce to /sign-in. */
export default async function AuthProblemPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; next?: string }>;
}) {
  const { reason, next } = await searchParams;
  const safe = REASONS.includes(reason as ConfirmFailure)
    ? (reason as ConfirmFailure)
    : "verify_failed";
  // Development builds only. In production the cause is in the server log,
  // where the operator can read it and the customer can't.
  const diagnosis =
    process.env.NODE_ENV === "development" ? confirmDiagnosis(safe) : undefined;
  return <ConfirmProblem reason={safe} next={safeRedirect(next)} diagnosis={diagnosis} />;
}
