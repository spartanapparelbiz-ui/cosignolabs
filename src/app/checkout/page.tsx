import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoLockup } from "@/components/brand/Logo";
import { CheckoutClient } from "@/components/checkout/CheckoutClient";
import type { Interval, PlanId } from "@/lib/plans";

export const metadata: Metadata = {
  title: "checkout — cosigno",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; interval?: string }>;
}) {
  const { plan: planParam, interval: intervalParam } = await searchParams;
  // Only paid plans check out; anything else goes back to pricing.
  const plan: PlanId = planParam === "max" ? "max" : planParam === "pro" ? "pro" : "free";
  if (plan === "free") redirect("/pricing");
  const interval: Interval = intervalParam === "annual" ? "annual" : "monthly";

  return (
    <div className="flex min-h-screen [min-height:100dvh] flex-col overflow-x-hidden">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5">
        <Link href="/" aria-label="cosigno home">
          <LogoLockup size={28} textClass="text-xl" />
        </Link>
        <Link
          href="/pricing"
          className="rounded-btn px-4 py-2 text-sm font-bold lowercase text-ink-soft transition-colors hover:bg-cream-deep"
        >
          ← back to plans
        </Link>
      </header>
      <main className="flex flex-1 items-center">
        <CheckoutClient plan={plan} interval={interval} />
      </main>
    </div>
  );
}
