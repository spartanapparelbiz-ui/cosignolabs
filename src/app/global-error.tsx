"use client";

import { useEffect } from "react";

/**
 * Root error boundary — the last line of defense if the root layout itself
 * fails. It must render its own <html>/<body>, and can't rely on the app's
 * layout or utility classes being applied, so the brand look is inlined.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 20,
          background: "#FBF4EA",
          color: "#141414",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          textAlign: "center",
          padding: "0 24px",
        }}
      >
        <svg width="48" height="48" viewBox="0 0 100 100" fill="none" aria-hidden="true">
          <path d="M 76 66.9 A 31 31 0 1 1 76 33.1" stroke="#FF4B1F" strokeWidth={26} strokeLinecap="round" />
          <path d="M 38 51 L 53 65 L 83 29" stroke="#141414" strokeWidth={17} strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="72" cy="18" r="7" fill="#FF4B1F" />
        </svg>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, textTransform: "lowercase" }}>
            something went sideways
          </h1>
          <p style={{ marginTop: 8, maxWidth: 360, fontSize: 14, color: "#5C5650" }}>
            that&apos;s on us, not you. try again in a moment — nothing was lost.
          </p>
        </div>
        <button
          onClick={reset}
          style={{
            border: "none",
            borderRadius: 10,
            background: "#141414",
            color: "#FBF4EA",
            padding: "10px 20px",
            fontSize: 14,
            fontWeight: 700,
            textTransform: "lowercase",
            cursor: "pointer",
          }}
        >
          try again
        </button>
      </body>
    </html>
  );
}
