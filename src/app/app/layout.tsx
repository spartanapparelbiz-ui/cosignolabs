import Link from "next/link";
import { clerkConfigured } from "@/lib/auth";
import { AppNav } from "@/components/AppNav";
import { ToastProvider } from "@/components/Toast";
import { LogoHome } from "@/components/brand/LivingLogo";
import { AccountChip } from "@/components/app/AccountChip";

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
      <div className="flex min-h-screen [min-height:100dvh] flex-col">
        <header className="sticky top-0 z-10 bg-cream/90 shadow-soft backdrop-blur">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
            <LogoHome href="/app" label="cosigno workspace" size={26} textClass="text-xl" />
            {/* On mobile the nav drops to its own full-width row (order-3);
                on sm+ it sits inline between the logo and the user slot. */}
            <div className="order-3 w-full sm:order-none sm:w-auto">
              <AppNav />
            </div>
            <div className="ml-auto flex items-center gap-3">{userSlot}</div>
          </div>
        </header>
        <main className="flex flex-1 flex-col">{children}</main>
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

  if (clerkConfigured()) {
    // Keep Clerk for the session/auth, but only for its headless pieces — the
    // visible UI is ours. The appearance still themes the sign-in/up routes.
    const { ClerkProvider } = await import("@clerk/nextjs");
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
      <ClerkProvider appearance={appearance} signInUrl="/sign-in" signUpUrl="/sign-up">
        <Chrome userSlot={userSlot}>{children}</Chrome>
      </ClerkProvider>
    );
  }

  return <Chrome userSlot={userSlot}>{children}</Chrome>;
}
