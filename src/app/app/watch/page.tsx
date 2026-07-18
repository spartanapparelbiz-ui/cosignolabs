import Link from "next/link";
import { AutomationsPanel } from "@/components/app/AutomationsPanel";

export const dynamic = "force-dynamic";

/**
 * Watch — cosigno's standing eyes on your connected systems. A watch is a
 * recurring rule: monitor (notify only), prepare (propose for approval), or
 * act (an explicit per-rule grant for routine actions). Plain missions live
 * on the missions page; this page is everything that runs on its own
 * schedule — and every consequential step still stops at your signature.
 */
export default function WatchPage() {
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
      <h1 className="text-xl font-extrabold lowercase">watch &amp; standing orders</h1>
      <p className="mt-1 max-w-2xl text-sm text-ink-soft">
        Ongoing responsibilities assigned to cosigno — watches on important emails, calendar
        conflicts, refund requests, big orders; standing orders like &ldquo;every morning,
        prepare my day.&rdquo; Each one observes, prepares for your approval, or (only where
        you&apos;ve explicitly allowed it) operates. You can also say it from the{" "}
        <Link href="/app" className="font-bold underline underline-offset-2 hover:text-ink">
          home page
        </Link>
        : &ldquo;watch for emails from investors.&rdquo; Want a head start?{" "}
        <Link href="/app/skills" className="font-bold underline underline-offset-2 hover:text-ink">
          Install a skill
        </Link>{" "}
        — a preconfigured set of watches and rules.
      </p>
      <div className="mt-5">
        <AutomationsPanel />
      </div>
    </div>
  );
}
