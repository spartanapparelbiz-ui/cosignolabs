"use client";

import { useState } from "react";
import { monogram, resolveLogo } from "@/lib/integrations/logos";

/**
 * A connector's logo, rendered safely and stably. The source is resolved to a
 * bundled self-hosted SVG, a sanitized raster data: URI, or a generated
 * monogram — never a remote URL and never remote markup. The box is a fixed
 * size (no layout shift when it loads), the image lazy-loads, and any load
 * error falls back to the monogram so a card never shows a broken image.
 */
export function ConnectorLogo({
  kind,
  providerKey,
  displayName,
  customIcon,
  size = 28,
}: {
  kind: "app" | "mcp";
  providerKey: string;
  displayName: string;
  /** For providers with a pre-resolved bundled icon path (from ProviderMeta). */
  customIcon?: unknown;
  size?: number;
}) {
  const resolved = resolveLogo({ kind, providerKey, displayName, customIcon });
  const [src, setSrc] = useState(resolved.src);

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-btn bg-cream-deep/70 ring-1 ring-inset ring-line/60"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        className="h-[70%] w-[70%] object-contain"
        onError={() => setSrc(monogram(displayName || "?"))}
      />
    </span>
  );
}
