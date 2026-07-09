import { clerkConfigured } from "@/lib/auth";

/**
 * Auth route-group layout. It exists to put a ClerkProvider around ONLY the
 * auth routes (/sign-in, /sign-up, /sso-callback) so the headless hooks have a
 * client — without pulling Clerk's runtime onto the marketing pages. When Clerk
 * isn't configured (local dev / sandbox) it renders children bare and the demo
 * engine takes over. The provider is told our branded routes so any internal
 * redirect lands on our surface, never Clerk's hosted pages.
 */
export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!clerkConfigured()) return <>{children}</>;

  const { ClerkProvider } = await import("@clerk/nextjs");
  return (
    <ClerkProvider
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      appearance={{
        variables: {
          colorPrimary: "#FF4B1F",
          colorText: "#141414",
          colorBackground: "#FBF4EA",
          fontFamily: "var(--font-nunito), system-ui, sans-serif",
        },
      }}
    >
      {children}
    </ClerkProvider>
  );
}
