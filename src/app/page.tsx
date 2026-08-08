import dynamic from "next/dynamic";
import { Hero } from "@/components/home/Hero";
import { ScrollProgress } from "@/components/home/primitives";
import { SiteFooter } from "@/components/home/SiteFooter";
import { SiteNav } from "@/components/home/SiteNav";
import type { ComparisonRow, PlanCard } from "@/components/home/Pricing";
import {
  actionLimitLabel,
  introOfferLabel,
  moneyLabel,
  PLAN_ORDER,
  PLANS,
} from "@/lib/plans";

/**
 * The cosigno home page.
 *
 * One continuous scene, told in order: the promise, the world without a
 * signature, the moment one arrives, how the loop actually works, the tools
 * it reaches, a mission holding for you, the approval at full size, the
 * record it leaves, who it's for, what it costs, and the one thing to do.
 *
 * Composition rules that hold across every section:
 *  · this file stays a server component — nothing below the hero ships its
 *    markup from the client, and the plans module never reaches the browser
 *    (pricing arrives as props, derived here from the single source).
 *  · every section below the fold is its own dynamic chunk, so the animation
 *    code for the monitoring stream isn't parsed to read the headline.
 *  · nothing is hidden behind an animation: sections server-render visible
 *    and the reveal state is armed after hydration, only below the fold.
 *  · `prefers-reduced-motion` doesn't just slow the page down — the pinned
 *    scroll stages collapse to ordinary stacked sections and the scrubbed
 *    scenes render in their resolved state.
 */

// Below-the-fold sections load as separate chunks. They still server-render,
// so the page is complete and readable before any of them arrive.
const Chaos = dynamic(() => import("@/components/home/Chaos").then((m) => m.Chaos));
const ApprovalMoment = dynamic(() =>
  import("@/components/home/ApprovalMoment").then((m) => m.ApprovalMoment)
);
const HowItWorks = dynamic(() =>
  import("@/components/home/HowItWorks").then((m) => m.HowItWorks)
);
const Connections = dynamic(() =>
  import("@/components/home/Connections").then((m) => m.Connections)
);
const Missions = dynamic(() => import("@/components/home/Missions").then((m) => m.Missions));
const Approvals = dynamic(() => import("@/components/home/Approvals").then((m) => m.Approvals));
const Monitoring = dynamic(() =>
  import("@/components/home/Monitoring").then((m) => m.Monitoring)
);
const Proof = dynamic(() => import("@/components/home/Proof").then((m) => m.Proof));
const Pricing = dynamic(() => import("@/components/home/Pricing").then((m) => m.Pricing));
const FinalCta = dynamic(() => import("@/components/home/FinalCta").then((m) => m.FinalCta));

/** Plan cards, derived from the enforced plan definitions — never retyped. */
const PLAN_CARDS: PlanCard[] = PLAN_ORDER.map((id) => {
  const plan = PLANS[id];
  return {
    id,
    name: plan.name,
    tagline: plan.tagline,
    price: `$${moneyLabel(plan.price.monthly)}`,
    cadence: plan.price.monthly === 0 ? "" : "/mo",
    features: plan.features,
    cta: id === "free" ? "start free" : `start with ${plan.name}`,
    featured: id === "pro",
  };
});

/** What the free plan actually gives you, straight from the enforced plan. */
const FREE_TERMS = [
  actionLimitLabel(PLANS.free).replace("AI operations", "ai operations"),
  `${PLANS.free.integrationLimit} connected app`,
  "no card",
].join(" · ");

const COMPARISON: ComparisonRow[] = [
  {
    label: "ai operations each month",
    cells: PLAN_ORDER.map((id) => PLANS[id].actionLimit.toLocaleString()),
  },
  {
    label: "connected apps",
    cells: PLAN_ORDER.map((id) =>
      Number.isFinite(PLANS[id].integrationLimit)
        ? String(PLANS[id].integrationLimit)
        : "unlimited"
    ),
  },
  { label: "your own apis and connectors", cells: PLAN_ORDER.map((id) => PLANS[id].customMcp) },
  { label: "full history export", cells: PLAN_ORDER.map((id) => PLANS[id].canExportCsv) },
  {
    label: "stronger planning when the work demands it",
    cells: PLAN_ORDER.map((id) => PLANS[id].strongerModel),
  },
  { label: "the approval model", cells: PLAN_ORDER.map(() => "identical") },
];

export default function HomePage() {
  // `overflow-x-clip`, never `overflow-x-hidden`: `hidden` makes this element a
  // scroll container, which silently breaks `position: sticky` for every pinned
  // scene below it. `clip` cuts the same overflow without creating one.
  return (
    <div className="flex min-h-screen [min-height:100dvh] flex-col overflow-x-clip">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-btn focus:bg-signal focus:px-4 focus:py-2 focus:text-sm focus:font-extrabold focus:lowercase focus:text-ink"
      >
        skip to content
      </a>

      <ScrollProgress />
      <SiteNav />

      <main id="content" className="flex-1">
        <Hero />
        <Chaos />
        <ApprovalMoment />
        <HowItWorks />
        <Connections />
        <Missions />
        <Approvals />
        <Monitoring />
        <Proof />
        <Pricing plans={PLAN_CARDS} rows={COMPARISON} intro={introOfferLabel()} />
        <FinalCta terms={FREE_TERMS} />
      </main>

      <SiteFooter />
    </div>
  );
}
