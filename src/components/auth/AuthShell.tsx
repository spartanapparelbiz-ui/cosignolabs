import Link from "next/link";

/**
 * The cream field every auth surface sits in — sign-in, sign-up, and the two
 * confirmation outcomes. Extracted so a confirmation notice is visibly the
 * same product as the form that sent it: same wash, same escape hatch, same
 * card. Landing on a differently-styled page mid-signup reads as an error even
 * when the words are reassuring.
 */
export function AuthShell({
  children,
  back = { href: "/", label: "back to home" },
}: {
  children: React.ReactNode;
  back?: { href: string; label: string } | null;
}) {
  return (
    <main className="relative flex min-h-screen [min-height:100dvh] flex-col items-center justify-center overflow-hidden bg-cream px-5 py-12 sm:px-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-60 [background:radial-gradient(60%_50%_at_50%_-10%,rgba(251, 76, 32,0.07),transparent_70%),radial-gradient(50%_40%_at_100%_100%,rgba(20,20,20,0.05),transparent_70%)]"
      />
      {back && (
        <Link
          href={back.href}
          className="absolute left-5 top-5 text-sm font-bold text-ink-soft transition hover:text-ink sm:left-8 sm:top-8"
        >
          ← {back.label}
        </Link>
      )}
      {children}
    </main>
  );
}

/** The card the auth surfaces share. One width, one radius, one shadow. */
export function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-sm animate-spring-in rounded-card border border-line/70 bg-surface p-6 shadow-soft">
      {children}
    </div>
  );
}
