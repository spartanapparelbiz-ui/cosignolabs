import { TrustCenter } from "@/components/trust/TrustCenter";

export const dynamic = "force-dynamic";

export default function TrustPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-6 py-8 lg:px-10">
      <h1 className="text-2xl font-extrabold lowercase">what cosigno may do</h1>
      <p className="mt-1.5 max-w-2xl text-sm text-ink-soft">
        every one of these is enforced before cosigno acts, not after. change any of
        them whenever you like — it takes effect on the next thing it tries.
      </p>
      <div className="mt-8">
        <TrustCenter />
      </div>
    </div>
  );
}
