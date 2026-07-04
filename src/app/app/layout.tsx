import Link from "next/link";
import { clerkConfigured } from "@/lib/auth";
import { AppNav } from "@/components/AppNav";
import { LogoLockup } from "@/components/brand/Logo";

export const dynamic = "force-dynamic";

function Chrome({
  children,
  userSlot,
}: {
  children: React.ReactNode;
  userSlot: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-cream/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-3">
          <Link href="/app" aria-label="cosigno workspace">
            <LogoLockup size={26} textClass="text-xl" />
          </Link>
          <AppNav />
          <div className="ml-auto flex items-center gap-3">{userSlot}</div>
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (clerkConfigured()) {
    const { ClerkProvider, UserButton, SignedIn, SignedOut, SignInButton } =
      await import("@clerk/nextjs");
    return (
      <ClerkProvider>
        <Chrome
          userSlot={
            <>
              <SignedIn>
                <UserButton afterSignOutUrl="/" />
              </SignedIn>
              <SignedOut>
                <SignInButton mode="modal">
                  <button className="rounded-pill bg-ink px-4 py-1.5 text-sm font-bold text-cream">
                    Sign in
                  </button>
                </SignInButton>
              </SignedOut>
            </>
          }
        >
          {children}
        </Chrome>
      </ClerkProvider>
    );
  }

  return (
    <Chrome
      userSlot={
        <span
          className="rounded-pill border border-line px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-ink-soft"
          title="Auth is not configured — running as a local demo user."
        >
          demo mode
        </span>
      }
    >
      {children}
    </Chrome>
  );
}
