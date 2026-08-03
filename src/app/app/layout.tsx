import Link from "next/link";
import { getUserId } from "@/lib/auth";
import { isGuestId } from "@/lib/publicMode";
import { AppRail, AppBottomNav } from "@/components/AppRail";
import { ToastProvider } from "@/components/Toast";
import { LogoHome } from "@/components/brand/LivingLogo";
import { EmergencyStop } from "@/components/app/EmergencyStop";
import { AccountChip } from "@/components/app/AccountChip";

export const dynamic = "force-dynamic";

/**
 * Honest, calm strip shown only to a public-sandbox guest. It tells the truth:
 * this is a temporary try-it space — nothing is saved and nothing real happens.
 */
function SandboxBanner() {
  return (
    <div className="bg-signal/12 text-ink">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-x-2 gap-y-0.5 px-4 py-1.5 text-center text-[12px] font-semibold">
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
      <div className="flex min-h-screen [min-height:100dvh]">
        {/* desktop: compact left rail */}
        <AppRail />
        <div className="flex min-w-0 flex-1 flex-col">
          {guest && <SandboxBanner />}
          <header className="sticky top-0 z-10 bg-cream/90 shadow-soft backdrop-blur">
            <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3">
              {/* mobile shows the logo up top; desktop's logo lives in the rail */}
              <div className="lg:hidden">
                <LogoHome href="/app" label="cosigno workspace" size={26} textClass="text-xl" />
              </div>
              <div className="ml-auto flex items-center gap-3">
                <EmergencyStop />
                {userSlot}
              </div>
            </div>
          </header>
          {/* bottom padding keeps content clear of the mobile bottom bar */}
          <main className="flex flex-1 flex-col pb-20 lg:pb-0">{children}</main>
          <footer className="border-t border-line/60">
            <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 py-4 text-[11px] font-semibold lowercase tracking-wide text-ink-soft">
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
        {/* mobile: bottom navigation bar */}
        <AppBottomNav />
      </div>
    </ToastProvider>
  );
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // One cosigno-branded account control everywhere. It shows the
  // personalized name + monogram and a menu (settings, theme, sign out);
  // sign out works with or without live auth configured.
  const userSlot = <AccountChip />;

  // Public-sandbox guests get an honest banner. Resolved server-side from the
  // guest id the middleware forwards; real signed-in users never see it.
  const guest = isGuestId(await getUserId());

  return <Chrome userSlot={userSlot} guest={guest}>{children}</Chrome>;
}
