import Link from "next/link";
import { ClerkAuthFlow } from "./ClerkAuthFlow";
import { DemoAuthFlow } from "./DemoAuthFlow";
import { withRedirect } from "./authRedirect";

/**
 * The full-screen branded auth shell: cream field, a quiet "back to home"
 * escape hatch, and the mark + form centered in it — continuous with the
 * landing page, with zero default-Clerk chrome. Picks the real Clerk engine
 * when configured, else the offline demo (dev/sandbox only).
 */
export function AuthScreen({
  mode,
  clerkEnabled,
  googleEnabled,
  dest,
}: {
  mode: "sign-in" | "sign-up";
  clerkEnabled: boolean;
  googleEnabled: boolean;
  dest: string;
}) {
  const other = mode === "sign-in" ? "/sign-up" : "/sign-in";
  const switchHref = withRedirect(other, dest);

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-cream px-5 py-12 sm:px-6">
      {/* soft brand wash so the cream field isn't flat */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-60 [background:radial-gradient(60%_50%_at_50%_-10%,rgba(255,75,31,0.07),transparent_70%),radial-gradient(50%_40%_at_100%_100%,rgba(20,20,20,0.05),transparent_70%)]"
      />
      <Link
        href="/"
        className="absolute left-5 top-5 text-sm font-bold text-ink-soft transition hover:text-ink sm:left-8 sm:top-8"
      >
        ← back to home
      </Link>

      {clerkEnabled ? (
        <ClerkAuthFlow
          mode={mode}
          googleEnabled={googleEnabled}
          dest={dest}
          switchHref={switchHref}
        />
      ) : (
        <DemoAuthFlow
          mode={mode}
          googleEnabled={googleEnabled}
          dest={dest}
          switchHref={switchHref}
        />
      )}
    </main>
  );
}
