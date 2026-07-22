import Link from "next/link";
import { clerkConfigured, getUserId } from "@/lib/auth";
import { isGuestId } from "@/lib/publicMode";
import { AppNav } from "@/components/AppNav";
import { ToastProvider } from "@/components/Toast";
import { LogoHome } from "@/components/brand/LivingLogo";
import { AccountChip } from "@/components/app/AccountChip";
import { Presence } from "@/components/presence/Presence";
import { HoldBanner } from "@/components/app/HoldBanner";

export const dynamic = "force-dynamic";

/**
 * Honest, calm strip shown only to a public-sandbox guest. It tells the truth:
 * this is a temporary try-it space — nothing is saved and nothing real happens.
 */
function SandboxBanner() {
  return (
    <div className="bg-signal/12 text-ink">
      <div className="mx-auto flex w-full max-w-none flex-wrap items-center justify-center gap-x-2 gap-y-0.5 px-6 lg:px-10 py-1.5 text-center text-[12px] font-semibold">
        <span>You&apos;re trying cosigno in a temporary sandbox — nothing is saved and no real emails, files, or payments are touched.</span>
        <Link href="/" className="underline underline-offset-2 hover:text-signal">
          Join the waitlist
        </Link>
      </div>
    </div>
  );
}

function Chrome({
  children,
  userSlot,
  guest,
}: {
  children: React.ReactNode;
  userSlot: React.ReactNode;
  guest: boolean;
}) {
  return (
    <ToastProvider>
      <div className="flex min-h-screen [min-height:100dvh] flex-col">
        {guest && <SandboxBanner />}
        {/* Cosigno Hold — the authority brake. Visible only while active. */}
        <HoldBanner />
        <header className="sticky top-0 z-10 bg-cream/90 shadow-soft backdrop-blur">
          <div className="mx-auto flex w-full max-w-none flex-wrap items-center gap-x-3 gap-y-2 px-6 lg:px-10 py-3">
            <LogoHome href="/app" label="cosigno workspace" size={26} textClass="text-xl" />
            {/* On mobile the nav drops to its own full-width row (order-3);
                on sm+ it sits inline between the logo and the user slot. */}
            <div className="order-3 w-full sm:order-none sm:w-auto">
              <AppNav />
            </div>
            {/* Cosigno Presence: the mark, its live state, and ⌘K activation. */}
            <div className="ml-auto flex items-center gap-2.5">
              <Presence />
              {userSlot}
            </div>
          </div>
        </header>
        <main className="flex flex-1 flex-col">{children}</main>
        <footer className="border-t border-line/60">
          <div className="mx-auto flex w-full max-w-none flex-wrap items-center justify-center gap-x-4 gap-y-1 px-6 lg:px-10 py-4 text-[11px] font-semibold lowercase tracking-wide text-ink-soft">
            <span>© {new Date().getFullYear()} aethric llc</span>
            <Link href="/privacy" className="hover:text-ink">
              privacy
            </Link>
            <Link href="/terms" className="hover:text-ink">
              terms
            </Link>
            <a href="mailto:hello@aethric.llc" className="hover:text-ink">
              hello@aethric.llc
            </a>
          </div>
        </footer>
      </div>
    </ToastProvider>
  );
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // One cosigno-branded account control everywhere — never Clerk's default
  // widget. It shows the personalized name + monogram and a menu (settings,
  // theme, sign out); sign out works with or without Clerk configured.
  const userSlot = <AccountChip />;

  // Public-sandbox guests get an honest banner. Resolved server-side from the
  // guest id the middleware forwards; real signed-in users never see it.
  const guest = isGuestId(await getUserId());

  if (clerkConfigured()) {
    // Keep Clerk for the session/auth, but only for its headless pieces — the
    // visible UI is ours. The appearance still themes the sign-in/up routes.
    const { ClerkProvider } = await import("@clerk/nextjs");
    const appearance = {
      variables: {
        colorPrimary: "#FB4C20",
        colorText: "#141414",
        colorBackground: "#F8F0E8",
        colorInputBackground: "#EFE5D7",
        borderRadius: "10px",
        fontFamily: "var(--font-nunito), system-ui, sans-serif",
      },
      elements: {
        card: "shadow-soft",
        formButtonPrimary: "bg-ink text-cream hover:bg-ink",
      },
    };
    return (
      <ClerkProvider appearance={appearance} signInUrl="/sign-in" signUpUrl="/sign-up">
        <Chrome userSlot={userSlot} guest={guest}>{children}</Chrome>
      </ClerkProvider>
    );
  }

  return <Chrome userSlot={userSlot} guest={guest}>{children}</Chrome>;
}
