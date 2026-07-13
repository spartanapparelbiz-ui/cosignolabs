"use client";

import { useEffect } from "react";

/**
 * Living-logo, in the browser tab. While the workspace is holding actions that
 * need a signature, the favicon gains a filled orange badge over the mark — the
 * same "something is waiting for you" signal the orb gives, carried to the tab
 * so it reads even when cosigno isn't the focused window. When nothing is
 * pending we remove our override and the static /favicon.svg takes back over.
 *
 * We layer a dedicated <link> at the end of <head> (browsers honor the last
 * declared icon) rather than mutating the app's own icon links.
 */
const LINK_ID = "favicon-status";

// The mark with a filled orange notification badge in the lower-right.
const PENDING_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<path d="M 76 66.9 A 31 31 0 1 1 76 33.1" fill="none" stroke="#FF4B1F" stroke-width="26" stroke-linecap="round"/>
<path d="M 38 51 L 53 65 L 83 29" fill="none" stroke="#141414" stroke-width="17" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="72" cy="18" r="7" fill="#FF4B1F"/>
<circle cx="84" cy="84" r="15" fill="#FF4B1F" stroke="#FBF4EA" stroke-width="5"/>
</svg>`;

const PENDING_ICON = `data:image/svg+xml,${encodeURIComponent(PENDING_SVG)}`;

export function useFaviconStatus(pending: boolean) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const existing = document.getElementById(LINK_ID);

    if (!pending) {
      existing?.remove();
      return;
    }

    const link =
      (existing as HTMLLinkElement | null) ?? document.createElement("link");
    link.id = LINK_ID;
    link.rel = "icon";
    link.type = "image/svg+xml";
    link.href = PENDING_ICON;
    if (!existing) document.head.appendChild(link);

    return () => link.remove();
  }, [pending]);
}
