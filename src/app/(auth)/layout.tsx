/**
 * Auth route-group layout. Supabase Auth is driven headlessly through the
 * browser client — no provider wrapper is needed, so the auth routes render
 * bare and stay as light as the marketing pages.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
