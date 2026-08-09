import { AccountCenter } from "@/components/account/AccountCenter";

export const dynamic = "force-dynamic";

export const metadata = { title: "account" };

export default function AccountPage() {
  return (
    <div className="mx-auto flex w-full max-w-none flex-1 flex-col px-6 lg:px-10 py-6">
      <h1 className="font-display text-2xl font-bold">Account</h1>
      <p className="mt-1 max-w-xl text-sm font-semibold text-ink-soft">
        Your operator, tuned to you — who you are, what it&apos;s allowed to do
        on its own, what it has learned about how you work, and what it&apos;s
        connected to.
      </p>
      <AccountCenter />
    </div>
  );
}
