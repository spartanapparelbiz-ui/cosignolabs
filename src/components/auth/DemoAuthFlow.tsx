"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuthForm } from "./AuthForm";
import { isValidEmail } from "./authProgress";

/**
 * The offline demo engine behind the same branded surface. When live auth isn't
 * configured (local dev / the sandbox) there's no real session to create, so a
 * valid-looking submission just stamps the mark and routes into /app as the
 * demo user — enough to exercise and screenshot the full experience. It is
 * never reachable in production (middleware fails closed before this renders).
 */
export function DemoAuthFlow({
  mode,
  googleEnabled,
  dest,
  switchHref,
}: {
  mode: "sign-in" | "sign-up";
  googleEnabled: boolean;
  dest: string;
  switchHref: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [stamped, setStamped] = useState(false);
  const [busy, setBusy] = useState(false);

  function go() {
    setError(null);
    setStamped(true);
    setBusy(true);
    // Let the check stamp land before the transition.
    window.setTimeout(() => router.push(dest), 650);
  }

  return (
    <AuthForm
      mode={mode}
      phase="credentials"
      busy={busy}
      error={error}
      notice={null}
      googleEnabled={googleEnabled}
      stamped={stamped}
      switchHref={switchHref}
      onSubmitCredentials={(email, password) => {
        if (!isValidEmail(email)) {
          setError("that email doesn't look right.");
          return;
        }
        if (password.length < 8) {
          setError("check your password — 8 characters or more.");
          return;
        }
        go();
      }}
      onSubmitCode={() => go()}
      onGoogle={() => go()}
    />
  );
}
