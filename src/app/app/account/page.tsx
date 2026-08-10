import { AccountCenter } from "@/components/account/AccountCenter";

export const dynamic = "force-dynamic";

export const metadata = { title: "account" };

export default function AccountPage() {
  return (
    <div className="mx-auto flex w-full max-w-none flex-1 flex-col px-6 lg:px-10 py-8">
      <h1 className="font-display text-2xl font-bold lowercase">account</h1>
      <p className="mt-1 text-sm font-semibold text-ink-soft">
        your operator, tuned to your comfort — profile, permissions, usage, and
        the trust panel that shows exactly what it&apos;s doing.
      </p>
      <AccountCenter />
    </div>
  );
}
