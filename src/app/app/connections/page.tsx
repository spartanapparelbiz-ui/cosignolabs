import Link from "next/link";
import { ConnectionsPanel } from "@/components/account/ConnectionsPanel";

export const dynamic = "force-dynamic";

export const metadata = { title: "Connections" };

/**
 * Connections — "what tools can AI use?"
 *
 * One question per screen: this page is the list of tools and nothing else.
 * The standing rules that govern those tools moved to Policies, where the
 * question is "what rules protect my business?" — two questions on one page is
 * how a product stops being obvious.
 */
export default function ConnectionsPage() {
  return (
    <div className="mx-auto flex w-full max-w-none flex-1 flex-col px-6 lg:px-10 py-8">
      <h1 className="font-display text-2xl font-bold lowercase">connections</h1>
      <p className="mt-1 text-sm font-semibold text-ink-soft">
        the tools AI can use. cosigno can only touch an app after you connect it, and only in the
        ways your{" "}
        <Link href="/app/policies" className="font-bold underline decoration-line underline-offset-2 hover:text-ink">
          policies
        </Link>{" "}
        allow.
      </p>
      <div className="mt-6 flex-1">
        <ConnectionsPanel />
      </div>
    </div>
  );
}
