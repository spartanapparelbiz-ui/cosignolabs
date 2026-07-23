import { SecurityCenter } from "@/components/security/SecurityCenter";

export const dynamic = "force-dynamic";

/**
 * Security & Control — the real control surface. Emergency Stop and Pause
 * write server-enforced hold state; session revocation runs through the auth
 * provider; export and delete are the actual data routes. Security is shown
 * through precise language and working controls, not decorative shields.
 */
export default function SecurityPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 lg:px-10 py-8">
      <h1 className="font-display text-2xl font-bold lowercase">security &amp; control</h1>
      <p className="mt-1 mb-6 text-sm font-semibold text-ink-soft">
        your controls over what cosigno can do, on which devices, with which
        apps — and the record of every sensitive change. the pause and emergency
        stop here are enforced on the server: scheduled work checks them before
        it runs.
      </p>
      <SecurityCenter />
    </div>
  );
}
