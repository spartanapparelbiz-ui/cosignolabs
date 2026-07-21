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
const PENDING_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
<path d="M112 35C91 17 59 17 37 37C13 59 13 101 37 123C59 143 91 143 112 125" fill="none" stroke="#FF4B22" stroke-width="22" stroke-linecap="round"/>
<path d="M44 81L69 106L121 54" fill="none" stroke="#171512" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="132" cy="132" r="26" fill="#FF4B22" stroke="#FBF4EA" stroke-width="8"/>
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
