import Link from "next/link";
import { getUserId } from "@/lib/auth";
import { isGuestId } from "@/lib/publicMode";
import { AppRail, AppBottomNav } from "@/components/AppRail";
import { ToastProvider } from "@/components/Toast";
import { LogoHome } from "@/components/brand/LivingLogo";
import { EmergencyStop } from "@/components/app/EmergencyStop";
import { HoldBanner } from "@/components/app/HoldBanner";
import { CommandBar, CommandBarTrigger } from "@/components/app/CommandBar";
import { AccountChip } from "@/components/app/AccountChip";

export const dynamic = "force-dynamic";

/**
 * The workspace shell.
 *
 * One room, not a set of admin pages: a quiet rail on the left, a header thin
 * enough to forget, and the page itself carrying all the weight. There is no
 * footer — copyright and legal links are marketing furniture, and repeating
 * them under every screen of a tool someone uses all day is noise. They live
 * in the account menu instead.
 */

/**
 * Honest, calm strip shown only to a public-sandbox guest. It tells the truth:
 * this is a temporary try-it space — nothing is saved and nothing real happens.
 */
function SandboxBanner() {
  return (
    <div className="bg-signal/[0.09]">
      <div className="mx-auto flex w-full max-w-[82rem] flex-wrap items-center justify-center gap-x-2 px-5 py-2 text-center text-[0.8125rem] sm:px-8">
        <span>This is a sandbox — nothing is saved, and nothing real is touched.</span>
        <Link href="/" className="font-semibold underline underline-offset-2 hover:text-signal">
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
          {/* A hold silently blocks every execution, so the way out of one
              belongs above the fold on every page — not hidden behind a header
              control the operator has to go looking for. Renders nothing when
              there is no hold. */}
          <HoldBanner />
          {/* ⌘K from anywhere in the workspace. Renders nothing until opened. */}
          <CommandBar />
          <header className="sticky top-0 z-20 border-b border-line/40 bg-cream/85 backdrop-blur-md">
            <div className="flex h-14 items-center gap-3 px-5 sm:px-8">
              {/* mobile shows the logo up top; desktop's logo lives in the rail */}
              <div className="lg:hidden">
                <LogoHome href="/app" label="cosigno workspace" size={24} textClass="text-lg" />
              </div>
              <CommandBarTrigger />
              <div className="ml-auto flex items-center gap-2">
                <EmergencyStop />
                {userSlot}
              </div>
            </div>
          </header>
          {/* bottom padding keeps content clear of the mobile bottom bar */}
          <main className="flex flex-1 flex-col pb-24 lg:pb-0">{children}</main>
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
