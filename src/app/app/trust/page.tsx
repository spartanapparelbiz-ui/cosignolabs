import { TrustCenter } from "@/components/trust/TrustCenter";

export const dynamic = "force-dynamic";

export default function TrustPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-6 py-10 lg:px-10">
      <h1 className="font-display text-3xl font-extrabold sm:text-4xl">Trust Center</h1>
      <p className="mt-2 max-w-2xl text-base text-ink-soft">
        Choose how much you trust cosigno to act on your behalf. Everything here can be
        changed at any time, and takes effect on the next thing it tries.
      </p>
      <div className="mt-9">
        <TrustCenter />
      </div>
    </div>
  );
}
