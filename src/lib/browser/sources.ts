/**
 * Allowed research sources for the browser operator MVP. Missions may only
 * NAVIGATE to hosts on this list — a small set of major manufacturers and
 * trusted retailers. This is a policy layer on top of (never instead of) the
 * SSRF module: every fetch is still validated against localhost / private-IP /
 * bad-protocol rules; this list additionally keeps the operator from wandering
 * to arbitrary sites during the first vertical slice.
 *
 * If a source blocks automated access, the mission records the failure
 * honestly and tries the next source — it never bypasses a block.
 */

export interface ResearchSource {
  /** Registrable host — subdomains of it are allowed too. */
  host: string;
  /** Human name shown in progress copy and reports. */
  name: string;
  /** Builds a public search-results URL for a query on this source. */
  searchUrl: (query: string) => string;
}

export const ALLOWED_SOURCES: ResearchSource[] = [
  {
    host: "bestbuy.com",
    name: "Best Buy",
    searchUrl: (q) => `https://www.bestbuy.com/site/searchpage.jsp?st=${encodeURIComponent(q)}`,
  },
  {
    host: "lenovo.com",
    name: "Lenovo",
    searchUrl: (q) => `https://www.lenovo.com/us/en/search?text=${encodeURIComponent(q)}`,
  },
  {
    host: "dell.com",
    name: "Dell",
    searchUrl: (q) => `https://www.dell.com/en-us/search/${encodeURIComponent(q)}`,
  },
  {
    host: "hp.com",
    name: "HP",
    searchUrl: (q) => `https://www.hp.com/us-en/shop/sitesearch?keyword=${encodeURIComponent(q)}`,
  },
  {
    host: "asus.com",
    name: "ASUS",
    searchUrl: (q) => `https://www.asus.com/us/search/?q=${encodeURIComponent(q)}`,
  },
  {
    host: "acer.com",
    name: "Acer",
    searchUrl: (q) => `https://www.acer.com/us-en/search?q=${encodeURIComponent(q)}`,
  },
  {
    host: "microsoft.com",
    name: "Microsoft",
    searchUrl: (q) => `https://www.microsoft.com/en-us/search/shop/devices?q=${encodeURIComponent(q)}`,
  },
  {
    host: "walmart.com",
    name: "Walmart",
    searchUrl: (q) => `https://www.walmart.com/search?q=${encodeURIComponent(q)}`,
  },
  {
    host: "newegg.com",
    name: "Newegg",
    searchUrl: (q) => `https://www.newegg.com/p/pl?d=${encodeURIComponent(q)}`,
  },
];

/** Sandbox hosts stay allowed so the labeled offline loop keeps working. */
const SANDBOX_HOSTS = new Set(["sandbox.shop", "sandbox.example"]);

/**
 * General research sources — where OPEN-ENDED research starts.
 *
 * The list above is a product allowlist: it exists so the purchase-shaped
 * flow can only ever wander among retailers it was built for. Open research
 * has the opposite requirement — a question about apartments, flights, or a
 * company is not answerable from a laptop retailer, and pre-listing every
 * site a person might ask about is exactly the per-website work this product
 * exists to avoid.
 *
 * So general research starts from a public search engine and follows what it
 * finds. The safety that matters is kept and is enforced elsewhere, per
 * action rather than per host: every fetch is SSRF-validated (no localhost,
 * no private ranges, https only), every research action is READ-ONLY, and
 * page content is carried as untrusted data that can never become an
 * instruction. Consequential steps do not run here at all — they can only
 * ever become an approval card.
 */
export const GENERAL_SOURCES: ResearchSource[] = [
  {
    host: "duckduckgo.com",
    name: "web search",
    searchUrl: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
  },
];

/**
 * May open-ended research open this URL? Public https only — the host is not
 * pre-listed, because open research cannot be. `assertPublicUrl` still runs
 * at fetch time and is what actually blocks private and loopback addresses.
 */
export function isAllowedResearchTarget(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  if (SANDBOX_HOSTS.has(host)) return true;
  // Reject anything that is obviously not a public name before the request is
  // ever made. The authoritative check is assertPublicUrl at fetch time.
  if (!host.includes(".") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  return true;
}

function hostOf(rawUrl: string): string | null {
  try {
    return new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** True when a URL is on an allowed source (or the labeled sandbox). */
export function isAllowedSource(rawUrl: string): boolean {
  const host = hostOf(rawUrl);
  if (!host) return false;
  if (SANDBOX_HOSTS.has(host)) return true;
  return ALLOWED_SOURCES.some((s) => host === s.host || host.endsWith("." + s.host));
}

/** The human name of the source a URL belongs to (for progress copy). */
export function sourceNameFor(rawUrl: string): string {
  const host = hostOf(rawUrl);
  if (!host) return "the website";
  if (SANDBOX_HOSTS.has(host)) return "workspace sandbox";
  const s = ALLOWED_SOURCES.find((x) => host === x.host || host.endsWith("." + x.host));
  return s?.name ?? host.replace(/^www\./, "");
}
