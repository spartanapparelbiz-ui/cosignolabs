/**
 * The template catalog — every ready-made job cosigno can genuinely start.
 *
 * The honesty rule is structural: a template is one of exactly three things,
 * and each of them provably works today.
 *
 *  - "engine":  one of the five built mission templates. Turnkey.
 *  - "goal":    a fixed goal string the mission compiler classifies into a
 *               real plan shape. Where the goal is missing a fact (which
 *               repository, what title), the MISSION asks — a structured
 *               question, not a failure.
 *  - "compose": a goal that needs the user's subject ("research the company
 *               ___"). Run opens the composer with the goal prefilled so one
 *               phrase finishes it. We do not run a mission on a blank —
 *               generic research on no subject would be busywork theatre.
 *
 * Nothing here promises a capability the engine lacks. There is no "merge a
 * pull request", no "deploy a website", no "process refunds" — the engine
 * cannot do those, and a template that pretended otherwise would be a dead
 * button with better typography. When the engine grows, the catalog grows.
 *
 * There are also no invented numbers: no fake "trending", no estimated
 * minutes. "Recently used" is your own history (stored on your device);
 * "recommended" is derived from which apps you actually connected.
 */

export type TemplateRun =
  | { kind: "engine"; template: "meeting_prep" | "laptop_compare" | "inbox_cleanup" | "followups" | "daily_brief" }
  | { kind: "goal"; goal: string }
  | { kind: "compose"; prefill: string };

export interface Template {
  key: string;
  icon: string;
  title: string;
  /** One sentence: the outcome, in the reader's words. */
  outcome: string;
  /** The apps genuinely used — with the labeled sandbox fallback where real. */
  apps: string[];
  /**
   * The one honest approval line: either it's entirely read-only, or exactly
   * what waits for a signature. Derived from the real plan shape.
   */
  approval: string;
  run: TemplateRun;
  /** Which connected app makes this template most relevant, for "recommended". */
  shinesWith?: "github" | "google" | "google-calendar";
}

export interface TemplateCategory {
  id: string;
  title: string;
  templates: Template[];
}

const READ_ONLY = "entirely read-only — nothing in your apps changes.";
const BROWSER_APPS = ["Browser operator", "or a clearly-labeled sandbox"];

export const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  {
    id: "development",
    title: "Development",
    templates: [
      {
        key: "gh_repos",
        icon: "🗂",
        title: "Take stock of my repositories",
        outcome: "A live read of your GitHub repositories — real names, real counts, never an example.",
        apps: ["GitHub"],
        approval: READ_ONLY,
        run: { kind: "goal", goal: "review my GitHub repositories" },
        shinesWith: "github",
      },
      {
        key: "gh_triage",
        icon: "🐛",
        title: "Triage a repository's issues",
        outcome: "The open issues in a repository you name, read from GitHub and summarized.",
        apps: ["GitHub"],
        approval: READ_ONLY,
        run: { kind: "goal", goal: "triage the issues in one repository" },
        shinesWith: "github",
      },
      {
        key: "gh_issue",
        icon: "✍️",
        title: "File a GitHub issue",
        outcome: "Cosigno drafts the issue, you approve it, and the opened issue is read back as proof.",
        apps: ["GitHub"],
        approval: "Opening the issue always waits for your approval.",
        run: { kind: "goal", goal: "file a new issue" },
        shinesWith: "github",
      },
      {
        key: "gh_analyze",
        icon: "🔬",
        title: "Analyze any public repository",
        outcome: "A cited research report on a repository you name — activity, purpose, structure.",
        apps: BROWSER_APPS,
        approval: READ_ONLY,
        run: { kind: "compose", prefill: "research the GitHub repository " },
      },
    ],
  },
  {
    id: "business",
    title: "Business",
    templates: [
      {
        key: "biz_competitors",
        icon: "🏁",
        title: "Research your competitors",
        outcome: "A cited comparison of the competitors you name — positioning, pricing, what they ship.",
        apps: BROWSER_APPS,
        approval: READ_ONLY,
        run: { kind: "compose", prefill: "research and compare these competitors: " },
      },
      {
        key: "biz_report",
        icon: "📊",
        title: "Turn your files into a report",
        outcome: "Attach your numbers or notes and get a board-ready findings report built from them.",
        apps: ["Your attached files"],
        approval: READ_ONLY,
        run: { kind: "compose", prefill: "review the attached files and compile a report on " },
      },
      {
        key: "biz_market",
        icon: "🌍",
        title: "Size up a market",
        outcome: "A cited research brief on a market you name — players, pricing, and where it's moving.",
        apps: BROWSER_APPS,
        approval: READ_ONLY,
        run: { kind: "compose", prefill: "research the market for " },
      },
    ],
  },
  {
    id: "research",
    title: "Research",
    templates: [
      {
        key: "res_products",
        icon: "⚖️",
        title: "Compare any products",
        outcome: "A side-by-side comparison with sources, ending in a data-backed recommendation.",
        apps: BROWSER_APPS,
        approval: READ_ONLY,
        run: { kind: "compose", prefill: "compare the best " },
      },
      {
        key: "res_company",
        icon: "🏢",
        title: "Research any company",
        outcome: "A cited findings report on a company you name — what they do, sell, and signal.",
        apps: BROWSER_APPS,
        approval: READ_ONLY,
        run: { kind: "compose", prefill: "research the company " },
      },
      {
        key: "res_contract",
        icon: "🧾",
        title: "Summarize a contract",
        outcome: "Attach the contract and get its key terms, obligations, and deadlines pulled out.",
        apps: ["Your attached files"],
        approval: READ_ONLY,
        run: {
          kind: "compose",
          prefill: "review the attached contract and summarize its key terms, obligations, and deadlines",
        },
      },
    ],
  },
  {
    id: "shopping",
    title: "Shopping",
    templates: [
      {
        key: "shop_laptop",
        icon: "💻",
        title: "Find the best laptop under $1,000",
        outcome: "Three product pages actually read, compared, and a recommendation — stopped at the product page, never a purchase.",
        apps: BROWSER_APPS,
        approval: READ_ONLY,
        run: { kind: "engine", template: "laptop_compare" },
      },
      {
        key: "shop_pc",
        icon: "🖥",
        title: "Spec the best gaming PC",
        outcome: "Researched parts for your budget with sources, and nothing bought on your behalf.",
        apps: BROWSER_APPS,
        approval: READ_ONLY,
        run: { kind: "compose", prefill: "compare the best gaming PC parts for a budget of " },
      },
      {
        key: "shop_any",
        icon: "🛒",
        title: "Compare before you buy",
        outcome: "Whatever you're about to buy, researched and compared before you spend a dollar.",
        apps: BROWSER_APPS,
        approval: READ_ONLY,
        run: { kind: "compose", prefill: "compare the best options before I buy " },
      },
    ],
  },
  {
    id: "travel",
    title: "Travel",
    templates: [
      {
        key: "travel_plan",
        icon: "🧳",
        title: "Plan a vacation",
        outcome: "A researched plan for the destination you name — where to stay, what's worth it, when to go.",
        apps: BROWSER_APPS,
        approval: READ_ONLY,
        run: { kind: "compose", prefill: "research and plan a vacation to " },
      },
      {
        key: "travel_itinerary",
        icon: "🗺",
        title: "Build an itinerary",
        outcome: "A day-by-day itinerary for a trip you describe, saved as a document you can share.",
        apps: BROWSER_APPS,
        approval: READ_ONLY,
        run: { kind: "compose", prefill: "research and build a day-by-day itinerary for " },
      },
    ],
  },
  {
    id: "content",
    title: "Content",
    templates: [
      {
        key: "content_blog",
        icon: "📝",
        title: "Draft a blog post",
        outcome: "A researched draft saved to your files. Drafts are never published anywhere.",
        apps: BROWSER_APPS,
        approval: READ_ONLY,
        run: { kind: "compose", prefill: "research and draft a blog post about " },
      },
      {
        key: "content_linkedin",
        icon: "💼",
        title: "Draft LinkedIn posts",
        outcome: "Three researched post drafts on your topic — yours to edit and post yourself.",
        apps: BROWSER_APPS,
        approval: READ_ONLY,
        run: { kind: "compose", prefill: "research and draft three LinkedIn posts about " },
      },
      {
        key: "content_youtube",
        icon: "📺",
        title: "Generate YouTube ideas",
        outcome: "Researched video ideas for your channel's topic, with what's already working cited.",
        apps: BROWSER_APPS,
        approval: READ_ONLY,
        run: { kind: "compose", prefill: "research video ideas about " },
      },
    ],
  },
  {
    id: "productivity",
    title: "Productivity",
    templates: [
      {
        key: "prod_inbox",
        icon: "📥",
        title: "Clean up my inbox",
        outcome: "What matters summarized, replies drafted for waiting threads, and the clutter archived.",
        apps: ["Gmail", "or a clearly-labeled sandbox"],
        approval: "Archiving anything waits for your approval — nothing is ever deleted.",
        run: { kind: "engine", template: "inbox_cleanup" },
        shinesWith: "google",
      },
      {
        key: "prod_brief",
        icon: "☀️",
        title: "Build my morning brief",
        outcome: "One brief from your calendar and overnight inbox, with suggested priorities.",
        apps: ["Google Calendar", "Gmail", "or a clearly-labeled sandbox"],
        approval: "Blocking time for the top item is a separate approval card.",
        run: { kind: "engine", template: "daily_brief" },
        shinesWith: "google-calendar",
      },
      {
        key: "prod_followups",
        icon: "🔁",
        title: "Prepare my follow-ups",
        outcome: "Context-aware follow-up drafts and a conflict-checked send time.",
        apps: ["Gmail", "Google Calendar", "or a clearly-labeled sandbox"],
        approval: "Sending always waits for your approval — and is verified in Sent Mail after.",
        run: { kind: "engine", template: "followups" },
        shinesWith: "google",
      },
      {
        key: "prod_meeting",
        icon: "📅",
        title: "Build tomorrow's meeting brief",
        outcome: "A meeting brief, an agenda, and a drafted (never sent) follow-up.",
        apps: ["Google Calendar", "Gmail", "Drive", "or a clearly-labeled sandbox"],
        approval: "Sending the follow-up waits for your approval.",
        run: { kind: "engine", template: "meeting_prep" },
        shinesWith: "google-calendar",
      },
    ],
  },
  {
    id: "personal",
    title: "Personal",
    templates: [
      {
        key: "personal_insurance",
        icon: "🛡",
        title: "Compare insurance options",
        outcome: "The options for the cover you name, researched and compared with sources.",
        apps: BROWSER_APPS,
        approval: READ_ONLY,
        run: { kind: "compose", prefill: "research and compare insurance options for " },
      },
      {
        key: "personal_apartments",
        icon: "🏠",
        title: "Research apartments",
        outcome: "A researched shortlist for the area and budget you name — nothing contacted, nothing signed.",
        apps: BROWSER_APPS,
        approval: READ_ONLY,
        run: { kind: "compose", prefill: "research apartments in " },
      },
      {
        key: "personal_fitness",
        icon: "💪",
        title: "Build a fitness plan",
        outcome: "A researched weekly plan for your goal, saved as a document you'll actually follow.",
        apps: BROWSER_APPS,
        approval: READ_ONLY,
        run: { kind: "compose", prefill: "research and build a weekly fitness plan for " },
      },
    ],
  },
];

export const ALL_TEMPLATES: Template[] = TEMPLATE_CATEGORIES.flatMap((c) => c.templates);

/** Case-insensitive instant search over titles, outcomes, and categories. */
export function searchTemplates(query: string): Template[] {
  const q = query.trim().toLowerCase();
  if (!q) return ALL_TEMPLATES;
  return TEMPLATE_CATEGORIES.flatMap((c) =>
    c.templates.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.outcome.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q)
    )
  );
}

/**
 * Templates that shine with the apps this user actually connected. Real
 * signal only — with nothing connected there is no "recommended" row, rather
 * than a fake one.
 */
export function recommendedFor(connectedProviderKeys: string[]): Template[] {
  const connected = new Set(connectedProviderKeys);
  return ALL_TEMPLATES.filter((t) => t.shinesWith && connected.has(t.shinesWith));
}
