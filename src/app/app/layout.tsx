import Link from "next/link";
import { clerkConfigured } from "@/lib/auth";
import { AppNav } from "@/components/AppNav";
import { ToastProvider } from "@/components/Toast";
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
    <ToastProvider>
      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-10 bg-cream/90 shadow-soft backdrop-blur">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
            <Link href="/app" aria-label="cosigno workspace" prefetch>
              <LogoLockup size={26} textClass="text-xl" />
            </Link>
            {/* On mobile the nav drops to its own full-width row (order-3);
                on sm+ it sits inline between the logo and the user slot. */}
            <div className="order-3 w-full sm:order-none sm:w-auto">
              <AppNav />
            </div>
            <div className="ml-auto flex items-center gap-3">{userSlot}</div>
          </div>
        </header>
        <main className="flex flex-1 flex-col">{children}</main>
      </div>
    </ToastProvider>
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
    // Map Clerk widgets to the cosigno tokens (never the default look).
    const appearance = {
      variables: {
        colorPrimary: "#FF4B1F",
        colorText: "#141414",
        colorBackground: "#FBF4EA",
        colorInputBackground: "#F3E9DA",
        borderRadius: "10px",
        fontFamily: "var(--font-nunito), system-ui, sans-serif",
      },
      elements: {
        card: "shadow-soft",
        formButtonPrimary: "bg-ink text-cream hover:bg-ink",
      },
    };
    return (
      <ClerkProvider appearance={appearance}>
        <Chrome
          userSlot={
            <>
              <SignedIn>
                <UserButton afterSignOutUrl="/" />
              </SignedIn>
              <SignedOut>
                <SignInButton mode="modal">
                  <button className="rounded-btn bg-ink px-4 py-1.5 text-sm font-bold text-cream">
                    sign in
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
          className="rounded-pill bg-cream-deep px-3 py-1 text-[11px] font-bold lowercase tracking-wide text-ink-soft"
          title="auth is not configured — running as a local demo user."
        >
          demo mode
        </span>
      }
    >
      {children}
    </Chrome>
  );
}
