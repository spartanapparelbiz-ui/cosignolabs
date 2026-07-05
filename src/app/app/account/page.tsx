import { AccountCenter } from "@/components/account/AccountCenter";

export const dynamic = "force-dynamic";

export default function AccountPage() {
  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
      <h1 className="text-xl font-extrabold lowercase">account</h1>
      <p className="mt-1 text-sm text-ink-soft">
        your operator, tuned to your comfort — profile, permissions, usage, and
        the trust panel that shows exactly what it&apos;s doing.
      </p>
      <AccountCenter />
    </div>
  );
}
