import { detectInjection } from "../agent/untrusted";
import { sourceNameFor } from "./sources";
import type { PageObservation } from "./provider";

/**
 * Product extraction — turns ONE page observation into a structured product
 * finding. The rule that matters: only information actually present on the
 * page is captured; anything the page didn't state is null. Nothing is ever
 * guessed, averaged, or filled in from memory.
 *
 * All input is untrusted page content: the output carries an injection flag
 * when the page tried to steer the agent, and the extraction itself is pure
 * pattern-matching — page text can never trigger actions or change the goal.
 */

export interface ExtractedProduct {
  name: string;
  brand: string;
  currentPrice: number | null;
  currency: string;
  retailer: string;
  productUrl: string;
  processor: string | null;
  memory: string | null;
  storage: string | null;
  display: string | null;
  graphics: string | null;
  batteryClaim: string | null;
  availability: string | null;
  warranty: string | null;
  returnPolicy: string | null;
  sourceTitle: string;
  injection: boolean;
  accessedAt: string;
}

const KNOWN_BRANDS = [
  "Lenovo", "Dell", "HP", "ASUS", "Acer", "Microsoft", "Apple", "MSI",
  "Samsung", "LG", "Razer", "Gigabyte", "Alienware", "Surface",
];

/** First regex capture across the given texts, or null — never a guess. */
function firstMatch(texts: string[], patterns: RegExp[]): string | null {
  for (const t of texts) {
    for (const p of patterns) {
      const m = p.exec(t);
      if (m) return (m[1] ?? m[0]).replace(/\s+/g, " ").trim().slice(0, 120);
    }
  }
  return null;
}

/** Price + currency from text like "$899.99", "USD 899", "£749.00". */
function findPrice(texts: string[]): { price: number | null; currency: string } {
  for (const t of texts) {
    const m =
      /(?:\$|USD\s?)\s?([0-9]{2,4}(?:,[0-9]{3})?(?:\.[0-9]{2})?)/.exec(t) ??
      /£\s?([0-9]{2,4}(?:,[0-9]{3})?(?:\.[0-9]{2})?)/.exec(t) ??
      /€\s?([0-9]{2,4}(?:,[0-9]{3})?(?:\.[0-9]{2})?)/.exec(t);
    if (m) {
      const value = Number(m[1].replace(/,/g, ""));
      if (Number.isFinite(value) && value > 50 && value < 100_000) {
        const currency = m[0].includes("£") ? "GBP" : m[0].includes("€") ? "EUR" : "USD";
        return { price: value, currency };
      }
    }
  }
  return { price: null, currency: "USD" };
}

/** Extract a structured product from a page observation. Nulls, never guesses. */
export function extractProduct(obs: PageObservation): ExtractedProduct {
  // Search space: table cells first (most structured), then headings, then body.
  const tableText = obs.tables.flatMap((t) => t.rows.map((r) => r.join(" : "))).join("\n");
  const texts = [tableText, obs.headings.join("\n"), obs.summary];

  const name = (obs.headings[0] ?? obs.title.split(/[|—–-]/)[0] ?? obs.title)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  const brand =
    KNOWN_BRANDS.find((b) => new RegExp(`\\b${b}\\b`, "i").test(name + " " + obs.title)) ?? "";

  const { price, currency } = findPrice(texts);

  const processor = firstMatch(texts, [
    /\b((?:Intel\s+)?Core\s+(?:Ultra\s+)?i?[3579][- ]?\w*)/i,
    /\b(AMD\s+Ryzen(?:\s+AI)?\s+[3579]\s*\w*)/i,
    /\b(Snapdragon\s+X\s*\w*)/i,
    /\b(Apple\s+M[1-4]\s*(?:Pro|Max)?)/i,
  ]);
  const memory = firstMatch(texts, [/\b([0-9]{1,3}\s?GB)\s+(?:of\s+)?(?:RAM|memory|LPDDR\w*|DDR\w*)/i]);
  const storage = firstMatch(texts, [/\b([0-9]{3,4}\s?GB|[12]\s?TB)\s+(?:of\s+)?(?:SSD|storage|NVMe)/i]);
  const display = firstMatch(texts, [
    /\b([0-9]{2}(?:\.[0-9])?["”-]?\s?(?:inch\s+)?(?:touch\s*screen\s+)?(?:OLED|IPS|FHD\+?|QHD\+?|WUXGA|2\.?[0-9]?K|4K|UHD)[^.,;|\n]{0,40})/i,
    /\b([0-9]{2}(?:\.[0-9])?[-\s]?inch[^.,;|\n]{0,40})/i,
  ]);
  const graphics = firstMatch(texts, [
    /\b((?:NVIDIA\s+)?(?:GeForce\s+)?RTX\s?\d{4}\w*)/i,
    /\b(Intel\s+(?:Arc|Iris\s+Xe|UHD)\s*\w*)/i,
    /\b(AMD\s+Radeon\s*\w*)/i,
  ]);
  const batteryClaim = firstMatch(texts, [/\b(?:up\s+to\s+)?([0-9]{1,2}(?:\.[0-9])?\s+hours?[^.,;|\n]{0,30}battery|battery[^.,;|\n]{0,30}[0-9]{1,2}\s+hours?)/i]);
  const availability = firstMatch(texts, [
    /\b(in stock[^.,;|\n]{0,40})/i,
    /\b(out of stock[^.,;|\n]{0,20})/i,
    /\b(sold out)/i,
    /\b(available\s+(?:for\s+)?(?:delivery|pickup|shipping)[^.,;|\n]{0,30})/i,
    /\b(low stock[^.,;|\n]{0,30})/i,
    /\b(currently unavailable)/i,
  ]);
  const warranty = firstMatch(texts, [/\b([0-9]+[- ]?(?:year|month)s?\s+(?:limited\s+)?warranty)/i, /\bwarranty\s*:?\s+([^.,;|\n]{3,60})/i]);
  const returnPolicy = firstMatch(texts, [/\b([0-9]+[- ]?day\s+(?:free\s+)?returns?)/i, /\breturns?\s*(?:policy)?\s*:?\s+([0-9]+[- ]?days?[^.,;|\n]{0,30})/i]);

  const injection = detectInjection([obs.title, obs.summary, tableText].join("\n"));

  return {
    name: name || obs.title.slice(0, 200),
    brand,
    currentPrice: price,
    currency,
    retailer: sourceNameFor(obs.url),
    productUrl: obs.url,
    processor,
    memory,
    storage,
    display,
    graphics,
    batteryClaim,
    availability,
    warranty,
    returnPolicy,
    sourceTitle: obs.title.slice(0, 300),
    injection,
    accessedAt: new Date().toISOString(),
  };
}

/** True when a page yielded enough substance to count as a reviewed product. */
export function isUsableProduct(p: ExtractedProduct): boolean {
  // A real review needs at least a name plus a price or one concrete spec.
  return Boolean(
    p.name && (p.currentPrice !== null || p.processor || p.memory || p.storage)
  );
}
