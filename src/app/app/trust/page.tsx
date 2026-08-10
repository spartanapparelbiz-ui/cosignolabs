import { TrustCenter } from "@/components/trust/TrustCenter";

export const dynamic = "force-dynamic";

export default function TrustPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-6 py-8 lg:px-10">
      <h1 className="font-display text-2xl font-bold lowercase">trust center</h1>
      <p className="mt-1 max-w-2xl text-sm font-semibold text-ink-soft">
        choose how much you trust cosigno to act on your behalf. everything here can be
        changed at any time, and takes effect on the next thing it tries.
      </p>
      <div className="mt-9">
        <TrustCenter />
      </div>
    </div>
  );
}
