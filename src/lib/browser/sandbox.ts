import { createHash } from "crypto";
import type {
  BrowserActionInput,
  BrowserActionOutcome,
  BrowserProvider,
  BrowserSessionHandle,
  PageObservation,
} from "./provider";

/**
 * The sandbox browser provider. Deterministic, offline, and ALWAYS labeled
 * simulated — every observation and outcome carries simulated:true so the UI
 * and receipts can never mistake it for a live page. It exists so the whole
 * browser mission loop (research → compare → prepare → approve → verify) is
 * exercisable end-to-end with no external service, and so tests are hermetic.
 *
 * It models a tiny fixture "internet": three laptop product pages and a
 * generic form page. Real current prices require the RemoteBrowserProvider.
 */

interface FixtureProduct {
  retailer: string;
  product: string;
  price: number;
  specs: string;
  availability: string;
  warranty: string;
  returns: string;
}

const CATALOG: Record<string, FixtureProduct> = {
  "https://sandbox.shop/laptops/aria-14": {
    retailer: "sandbox electronics",
    product: "Aria 14 (Ryzen 7 / 16GB / 512GB)",
    price: 899.99,
    specs: "Ryzen 7, 16GB RAM, 512GB SSD, 14\" 2.2K, 1.4kg",
    availability: "in stock — delivery in 3 days",
    warranty: "1-year limited",
    returns: "30-day returns",
  },
  "https://sandbox.shop/laptops/nova-15": {
    retailer: "sandbox electronics",
    product: "Nova 15 (Core i5 / 16GB / 1TB)",
    price: 949.0,
    specs: "Core i5, 16GB RAM, 1TB SSD, 15.6\" FHD, 1.7kg",
    availability: "in stock — delivery in 2 days",
    warranty: "1-year limited",
    returns: "30-day returns",
  },
  "https://sandbox.shop/laptops/flux-13": {
    retailer: "sandbox electronics",
    product: "Flux 13 (Core i7 / 16GB / 512GB)",
    price: 799.0,
    specs: "Core i7, 16GB RAM, 512GB SSD, 13.3\" 2.5K, 1.2kg",
    availability: "low stock — delivery in 5 days",
    warranty: "2-year limited",
    returns: "45-day returns",
  },
};

export const SANDBOX_PRODUCT_URLS = Object.keys(CATALOG);
export const SANDBOX_SEARCH_URL = "https://sandbox.shop/search?q=laptops+under+1000";

function ref(seed: string): string {
  return createHash("sha256").update(seed).digest("hex").slice(0, 16);
}

function productObservation(url: string, p: FixtureProduct): PageObservation {
  return {
    url,
    title: `${p.product} — ${p.retailer}`,
    summary: `${p.product} at ${p.retailer}. price $${p.price.toFixed(2)}. ${p.specs}. ${p.availability}. warranty: ${p.warranty}. ${p.returns}.`,
    headings: [p.product, "specifications", "price & availability", "warranty & returns"],
    links: [{ text: "add to cart", href: `${url}#cart` }],
    buttons: ["add to cart", "buy now"],
    formFields: [],
    tables: [
      {
        caption: "specifications",
        rows: [
          ["price", `$${p.price.toFixed(2)}`],
          ["specs", p.specs],
          ["availability", p.availability],
          ["warranty", p.warranty],
          ["returns", p.returns],
        ],
      },
    ],
    downloads: [],
    warnings: [],
    loginRequired: false,
    simulated: true,
  };
}

function searchObservation(): PageObservation {
  return {
    url: SANDBOX_SEARCH_URL,
    title: "laptops under $1,000 — search results (sandbox)",
    summary: "sandbox search results: three laptops under $1,000.",
    headings: ["results"],
    links: SANDBOX_PRODUCT_URLS.map((u) => ({ text: CATALOG[u].product, href: u })),
    buttons: [],
    formFields: [],
    tables: [],
    downloads: [],
    warnings: ["sandbox results — connect a live browser provider for real current prices."],
    loginRequired: false,
    simulated: true,
  };
}

function genericObservation(url: string): PageObservation {
  return {
    url,
    title: "sandbox page",
    summary: `a sandbox page at ${url}. no live content is fetched in the sandbox provider.`,
    headings: ["sandbox"],
    links: [],
    buttons: [],
    formFields: [],
    tables: [],
    downloads: [],
    warnings: ["sandbox provider — this is not a live page."],
    loginRequired: false,
    simulated: true,
  };
}

/**
 * A DOMAIN-AGNOSTIC sandbox result set, derived from the query itself.
 *
 * The laptop catalog above is a fixed fixture, which is fine for the tools
 * built around it and useless for everything else — a mission about
 * apartments got laptop pages back. This builds a small, deterministic result
 * set for ANY query so the full research loop is exercisable without a live
 * provider, in any domain.
 *
 * The candidates are openly synthetic: the option names are literally the
 * user's own query plus an option number, every field carries the query, and
 * every observation is `simulated: true` and warns in its own text. Nothing
 * here can be mistaken for a real listing, because there is no real-looking
 * detail to mistake — that is the point. Real results need a live provider.
 */
const SANDBOX_RESULT_COUNT = 4;

function seededInt(seed: string, min: number, max: number): number {
  const h = createHash("sha256").update(seed).digest();
  return min + (h.readUInt32BE(0) % Math.max(1, max - min + 1));
}

export function sandboxResultUrl(query: string, n: number): string {
  return `https://sandbox.example/${encodeURIComponent(query.slice(0, 40).trim().replace(/\s+/g, "-").toLowerCase() || "results")}/option-${n}`;
}

function sandboxCandidateObservation(query: string, n: number): PageObservation {
  const url = sandboxResultUrl(query, n);
  // A price-shaped number so comparison/ranking logic has something to sort,
  // deterministic per (query, option) so runs are reproducible.
  const value = seededInt(`${query}#${n}`, 100, 2000);
  return {
    url,
    title: `example option ${n} for “${query}” (sandbox)`,
    summary: `sandbox example option ${n} for “${query}”. indicative figure $${value}. this is generated example data, not a real listing.`,
    headings: [`example option ${n}`, "details"],
    links: [],
    buttons: [],
    formFields: [],
    tables: [
      {
        caption: "details",
        rows: [
          ["option", `example option ${n}`],
          ["query", query],
          ["indicative figure", `$${value}`],
          ["source", "generated sandbox data"],
        ],
      },
    ],
    downloads: [],
    warnings: ["sandbox result — connect a live browser provider for real pages."],
    loginRequired: false,
    simulated: true,
  };
}

/** The result page for an arbitrary query, linking to the candidates. */
function sandboxQueryResults(query: string): PageObservation {
  const links = Array.from({ length: SANDBOX_RESULT_COUNT }, (_, i) => ({
    text: `example option ${i + 1} for “${query}”`,
    href: sandboxResultUrl(query, i + 1),
  }));
  return {
    url: `https://sandbox.example/search?q=${encodeURIComponent(query)}`,
    title: `“${query}” — sandbox results`,
    summary: `${links.length} sandbox example results for “${query}”. these are generated, not real listings.`,
    headings: ["results"],
    links,
    buttons: [],
    formFields: [],
    tables: [],
    downloads: [],
    warnings: ["sandbox results — connect a live browser provider for real pages."],
    loginRequired: false,
    simulated: true,
  };
}

function observationFor(url: string): PageObservation {
  if (CATALOG[url]) return productObservation(url, CATALOG[url]);
  // A generated candidate page — reachable by inspecting a link from a
  // query-derived result set, so the research loop works in any domain.
  const candidate = /^https:\/\/sandbox\.example\/(.+)\/option-(\d+)$/.exec(url);
  if (candidate) {
    return sandboxCandidateObservation(decodeURIComponent(candidate[1]).replace(/-/g, " "), Number(candidate[2]));
  }
  const generated = /^https:\/\/sandbox\.example\/search\?q=(.*)$/.exec(url);
  if (generated) return sandboxQueryResults(decodeURIComponent(generated[1]));
  if (url.startsWith(SANDBOX_SEARCH_URL) || url.includes("/search")) return searchObservation();
  return genericObservation(url);
}

export class SandboxBrowserProvider implements BrowserProvider {
  key = "sandbox";
  readonly simulated = true;

  isConfigured(): boolean {
    return true; // always available
  }

  async createSession(args: { objective: string; startUrl?: string }): Promise<BrowserSessionHandle> {
    return {
      providerRef: `sbx-${ref(args.objective + (args.startUrl ?? "") + Date.now())}`,
      provider: this.key,
      simulated: true,
    };
  }

  async observe(_handle: BrowserSessionHandle, url?: string): Promise<PageObservation> {
    return observationFor(url ?? SANDBOX_SEARCH_URL);
  }

  async act(_handle: BrowserSessionHandle, action: BrowserActionInput): Promise<BrowserActionOutcome> {
    const { kind, target, value } = action;
    switch (kind) {
      case "navigate":
      case "openLink":
      case "inspect": {
        const obs = observationFor(target ?? SANDBOX_SEARCH_URL);
        return { ok: true, summary: `read ${obs.title}.`, observation: obs, simulated: true };
      }
      case "searchWithinPage": {
        // A query gets a result set derived from that query, in any domain.
        // Without one there is nothing to derive from, so the fixed catalog
        // stands in.
        const obs = target?.trim() ? sandboxQueryResults(target.trim()) : searchObservation();
        return { ok: true, summary: `searched for “${target ?? ""}” — ${obs.links.length} results.`, observation: obs, simulated: true };
      }
      case "captureScreenshot":
        return { ok: true, summary: "captured a screenshot (sandbox placeholder).", simulated: true };
      case "typeDraftValue":
      case "selectDraftValue":
        return { ok: true, summary: `staged ${target ?? "field"} = “${value ?? ""}” (draft only — not submitted).`, form: { [target ?? "field"]: value ?? "" }, simulated: true };
      case "prepareFormSubmission":
        return { ok: true, summary: "form prepared — nothing submitted.", simulated: true };
      case "submitApprovedForm":
        // Only ever reached AFTER an approval card executed. The sandbox
        // returns a labeled confirmation so verification can run.
        return {
          ok: true,
          summary: "submitted the prepared form (sandbox).",
          confirmation: { confirmation_number: `SBX-${ref(target ?? "form")}`, page: "confirmation (sandbox)", simulated: true },
          simulated: true,
        };
      case "downloadPublicFile":
        return { ok: true, summary: "downloaded a public file (sandbox placeholder).", download: { name: target ?? "file.pdf", size: 1024, ref: ref(target ?? "dl") }, simulated: true };
      case "clickReadOnlyControl":
      case "scroll":
        return { ok: true, summary: `${kind} (sandbox).`, simulated: true };
      default:
        return { ok: false, summary: "unknown browser action.", simulated: true };
    }
  }

  async destroySession(): Promise<void> {
    // nothing to tear down in the sandbox
  }
}
