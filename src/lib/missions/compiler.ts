import type { CapabilityManifest } from "./capabilities";
import { buildCapabilityManifest } from "./capabilities";
import { validatePlan, type CompiledPlan, type ValidationResult } from "./validate";
import { planAdaptively } from "./planner";
import type { MissionSourceKind, MissionSourceStatus } from "../types";

/**
 * The context a staged file/link source contributes to the compiler. Only
 * `ready` sources add extracted content; every source is listed on the
 * understanding screen so the user sees exactly what was (and wasn't) read.
 */
export interface SourceContext {
  id: string;
  kind: MissionSourceKind;
  name: string;
  subtype: string;
  status: MissionSourceStatus;
  summary: string;
  injection_flag: boolean;
}

/** Honest, human line for a source on the understanding screen. */
function describeSource(s: SourceContext): string {
  if (s.kind === "file") {
    if (s.status === "ready") {
      return s.summary && !s.summary.startsWith("[image attached")
        ? `${s.name} — file read as context`
        : `${s.name} — attached as a visual reference (not read as text)`;
    }
    if (s.status === "unsupported") return `${s.name} — file type not supported (won't be used)`;
    return `${s.name} — couldn't be read (won't be used)`;
  }
  // link
  const where = s.subtype ? ` (${s.subtype})` : "";
  switch (s.status) {
    case "ready":
      return `${s.name}${where} — page read as context`;
    case "login_required":
      return `${s.name}${where} — needs a sign-in, so the page wasn't read`;
    case "blocked":
      return `${s.name}${where} — the website blocked reading it`;
    case "checking":
    case "reading":
      return `${s.name}${where} — still being read`;
    default:
      return `${s.name}${where} — couldn't be opened (won't be used)`;
  }
}

/** A source contributes real content only when it was actually read. */
export function sourceIsUsable(s: SourceContext): boolean {
  return s.status === "ready" && s.summary.trim().length > 0;
}

/**
 * The Universal Mission Compiler. It turns an open-ended goal into a
 * VALIDATED, executable plan that references only tools that actually exist
 * in the capability manifest. It never executes anything — it emits a plan
 * the mission engine instantiates and runs through the same durable, gated
 * machinery as templates.
 *
 * The compiler is deterministic and capability-bound by construction: it maps
 * a goal to a shape, then builds that shape from the manifest (choosing live
 * vs sandbox tools and labeling the choice). A planner LLM, when configured,
 * refines the normalized goal and questions — but it can never introduce a
 * tool the manifest doesn't list, because the built steps come from the
 * manifest, not from free-form model output.
 */

export type GoalShape =
  | "meeting_prep"
  | "product_compare"
  | "github"
  | "research"
  | "organize_files"
  | "write"
  | "unsupported";

export interface CompileResult {
  understood: {
    normalizedGoal: string;
    willDo: string[];
    boundary: string;
    /** Every source the user provided, listed honestly by what was read. */
    informationProvided: string[];
  };
  plan: CompiledPlan;
  validation: ValidationResult;
  /** True when the plan can't be run as-is (unsupported goal / unrepairable). */
  blocked: boolean;
  shape: GoalShape;
}

function classify(goal: string): GoalShape {
  const g = goal.toLowerCase();
  // GitHub is checked FIRST, before the shopping and research keyword sets.
  // "review the issues in owner/repo" and "find my repositories" both contain
  // research verbs, and routing them to the browser operator is what made a
  // request for repositories come back as sandbox storefront listings.
  if (/\b(github|repo|repos|repositor(y|ies)|issue|issues|pull request|pr)\b/.test(g)) {
    return "github";
  }
  if (/\b(meeting|standup|sync|call|1:1|one-on-one)\b/.test(g) && /\b(prepare|prep|brief|ready)\b/.test(g)) {
    return "meeting_prep";
  }
  // The product-compare shape is the LAPTOP slice: its tools search laptop
  // retailers, its first step asks laptop requirements, and its report is a
  // laptop report. So it may only claim goals that are actually about one.
  //
  // It used to claim any goal containing "compare", "best", "cheapest", or
  // "price" — which is most shopping-shaped sentences ever written. "research
  // the best apartments near UCF" matched on "best" and came back with laptop
  // listings. A shape must never claim work its tools can't do; everything
  // else belongs to the domain-agnostic research shape below.
  const shoppingIntent = /\b(compare|comparison|best|cheapest|vs\.?|versus|shop|buy|purchase|price)\b/.test(g);
  const laptopSubject = /\b(laptop|laptops|notebook|macbook|chromebook|ultrabook|computer|computers|pc|pcs)\b/.test(g);
  if (shoppingIntent && laptopSubject) {
    return "product_compare";
  }
  if (/\b(research|find|review|check|look up|investigate|analy[sz]e|gather)\b/.test(g)) {
    return "research";
  }
  // Money movement / publishing with no supported connection → unsupported.
  if (/\b(pay|send money|wire|transfer|invest|trade|publish|post to)\b/.test(g)) {
    return "unsupported";
  }
  // Work on the workspace itself, and writing.
  //
  // Everything used to fall through to the research shape, which meant a goal
  // like "organize my files into a sensible structure" came back having
  // searched the WEB for the words "organize files sensible structure" and
  // recommended one of the results. Both of these now have real tools behind
  // them, so they get their own shapes rather than a refusal or a wrong turn.
  //
  // Each pattern needs an intent AND a subject, and each stands down where
  // another tool fits better: cosigno really can draft an email reply, and
  // "create a comparison" is research with a deliverable on the end.
  const emailContext = /\b(email|emails|inbox|reply|replies|message|messages|thread|threads|follow[\s-]?up)\b/.test(g);
  const researchContext = /\b(research|compare|comparison|find|price|options?)\b/.test(g);
  if (
    /\b(organi[sz]e|rename|sort|tidy|declutter|clean up)\b/.test(g) &&
    /\b(files?|folders?|documents?|workspace|deliverables?)\b/.test(g) &&
    !emailContext
  ) {
    return "organize_files";
  }
  if (
    /\b(write|draft|compose|create|generate)\b/.test(g) &&
    /\b(essay|post|posts|blog|article|story|script|copy|newsletter|brief|memo|letter|summary|report|document|write[\s-]?up)\b/.test(g) &&
    !emailContext &&
    !researchContext
  ) {
    return "write";
  }
  return "research"; // default to a safe read-only research shape
}

function meetingPrepPlan(goal: string): CompiledPlan {
  return {
    normalizedGoal: goal,
    successCriteria: ["a meeting brief and agenda exist", "a follow-up is drafted (not sent)"],
    assumptions: ["uses connected Google apps when available, otherwise a labeled sandbox"],
    questions: [],
    steps: [
      { idx: 0, purpose: "find the relevant upcoming calendar event", operator: "calendar", tool: "calendar.find_event", dependsOn: [] },
      { idx: 1, purpose: "search Gmail for related conversations", operator: "communication", tool: "gmail.search_related", dependsOn: [0] },
      { idx: 2, purpose: "search Drive for related files", operator: "files", tool: "drive.search_files", dependsOn: [0] },
      { idx: 3, purpose: "extract commitments, decisions, and open questions", operator: "research", tool: "analyze.extract", dependsOn: [1, 2] },
      { idx: 4, purpose: "build the meeting brief", operator: "files", tool: "deliverable.brief", dependsOn: [3] },
      { idx: 5, purpose: "draft the agenda", operator: "files", tool: "deliverable.agenda", dependsOn: [3] },
      { idx: 6, purpose: "write the mission receipt", operator: "chief", tool: "mission.receipt", dependsOn: [] },
    ],
    expectedDeliverables: ["meeting brief", "agenda", "follow-up draft"],
    approvalCheckpoints: ["sending the follow-up email requires your approval"],
    verificationRequirements: ["approval.offer_send: confirm the message appears in Sent Mail"],
    riskSummary: "read-only research and drafts; the only consequential step (sending) is approval-gated.",
    unsupported: [],
  };
}

function productComparePlan(goal: string, manifest: CapabilityManifest): CompiledPlan {
  const browserLive = manifest.browser.live;
  const assumptions = [
    browserLive
      ? "researches live pages on major manufacturer and retailer sites for current prices"
      : "no live browser provider is configured — research runs in a clearly-labeled sandbox with example prices",
  ];
  // The browser-operator MVP plan: eight fixed, read-only steps. The mission
  // opens real product pages, records only what they actually show, and STOPS
  // at the recommended product page — no purchase is ever attempted.
  return {
    normalizedGoal: goal,
    successCriteria: [
      "at least three products are reviewed from real pages (fewer only if sources block access, stated honestly)",
      "a comparison report is saved with prices, specs, strengths, and weaknesses",
      "the recommendation is supported by the collected data — never invented",
      "the mission stops before any purchase",
    ],
    assumptions,
    questions: [],
    steps: [
      { idx: 0, purpose: "Confirm requirements", operator: "chief", tool: "laptop.confirm", dependsOn: [] },
      { idx: 1, purpose: "Search for suitable laptops", operator: "browser", tool: "laptop.search", dependsOn: [0] },
      { idx: 2, purpose: "Review product one", operator: "browser", tool: "laptop.review", dependsOn: [1] },
      { idx: 3, purpose: "Review product two", operator: "browser", tool: "laptop.review", dependsOn: [2] },
      { idx: 4, purpose: "Review product three", operator: "browser", tool: "laptop.review", dependsOn: [3] },
      { idx: 5, purpose: "Compare the products", operator: "research", tool: "laptop.compare", dependsOn: [2, 3, 4] },
      { idx: 6, purpose: "Create recommendation", operator: "research", tool: "laptop.recommend", dependsOn: [5] },
      { idx: 7, purpose: "Save final report", operator: "files", tool: "laptop.report", dependsOn: [6] },
    ],
    expectedDeliverables: ["comparison report with a data-supported recommendation"],
    approvalCheckpoints: [],
    verificationRequirements: [],
    riskSummary: browserLive
      ? "entirely read-only — cosigno opens and reads public pages, and stops at the recommended product page. no purchase, login, or form submission ever happens."
      : "sandbox research (labeled) — read-only; no purchase, login, or form submission ever happens.",
    unsupported: [
      "completing a purchase or payment — cosigno researches, compares, and opens the recommended product page, then stops.",
    ],
  };
}

/**
 * GitHub work, routed to the real connector instead of the browser operator.
 *
 * The step list depends on what the goal actually asks for, because opening an
 * issue is a write and listing repositories is not — bundling them would put
 * an approval card in front of a read, teaching operators to click through
 * approvals without reading them.
 */
function githubPlan(goal: string): CompiledPlan {
  const g = goal.toLowerCase();
  const wantsIssue = /\b(open|create|file|raise|add|new)\b/.test(g) && /\bissues?\b/.test(g);
  const wantsIssueList = !wantsIssue && /\bissues?\b/.test(g);

  const steps = wantsIssue
    ? [
        { idx: 0, purpose: "Draft the issue and offer it for approval", operator: "code", tool: "github.propose_issue", dependsOn: [] as number[] },
        { idx: 1, purpose: "Write the mission receipt", operator: "chief", tool: "mission.receipt", dependsOn: [0] },
      ]
    : wantsIssueList
      ? [
          { idx: 0, purpose: "Read open issues in the repository", operator: "code", tool: "github.list_issues", dependsOn: [] as number[] },
          { idx: 1, purpose: "Write the mission receipt", operator: "chief", tool: "mission.receipt", dependsOn: [0] },
        ]
      : [
          { idx: 0, purpose: "Read your repositories", operator: "code", tool: "github.list_repos", dependsOn: [] as number[] },
          { idx: 1, purpose: "Write the mission receipt", operator: "chief", tool: "mission.receipt", dependsOn: [0] },
        ];

  return {
    normalizedGoal: goal,
    successCriteria: wantsIssue
      ? [
          "the issue is opened only after you approve the card",
          "the opened issue is read back from GitHub as evidence",
        ]
      : [
          "the result comes from your live GitHub connection, never an example",
          "nothing in the repository is changed",
        ],
    // There is no GitHub sandbox on purpose: inventing repository or issue
    // names would be indistinguishable from real output to the reader.
    assumptions: ["reads your live GitHub connection — GitHub must be connected, or the mission stops and says so"],
    questions: [],
    steps,
    expectedDeliverables: wantsIssue ? ["an opened GitHub issue, with its URL"] : ["what GitHub actually returned"],
    approvalCheckpoints: wantsIssue ? ["opening the issue requires your approval"] : [],
    verificationRequirements: wantsIssue
      ? ["github.propose_issue: confirm the issue exists on GitHub and record its URL"]
      : [],
    riskSummary: wantsIssue
      ? "read-only until you approve; the only write is opening one issue, which happens after approval and is then read back."
      : "entirely read-only — nothing in any repository is created, changed, or deleted.",
    unsupported: [],
  };
}

function researchPlan(goal: string, manifest: CapabilityManifest): CompiledPlan {
  const browserLive = manifest.browser.live;
  return {
    normalizedGoal: goal,
    successCriteria: ["relevant public sources are gathered and compared", "a cited findings deliverable exists"],
    assumptions: [
      browserLive ? "researches live public pages" : "no live browser provider — research runs in a clearly-labeled sandbox",
    ],
    questions: [],
    // The domain-agnostic research tools, NOT the laptop-shaped ones. This
    // shape is the catch-all — it receives every goal the other shapes don't
    // claim — so it has to take its subject from the goal rather than from a
    // fixture. `browser.research` opened the same three laptop pages whatever
    // the mission was about, which made a report about apartments come back
    // full of laptops.
    steps: [
      { idx: 0, purpose: "search for what the goal is actually about, and read the results", operator: "browser", tool: "web.research", dependsOn: [] },
      { idx: 1, purpose: "rank what was found against what the goal asked for", operator: "research", tool: "analyze.compare", dependsOn: [0] },
      { idx: 2, purpose: "write up the findings with their sources", operator: "files", tool: "deliverable.report", dependsOn: [1] },
      { idx: 3, purpose: "write the mission receipt", operator: "chief", tool: "mission.receipt", dependsOn: [] },
    ],
    expectedDeliverables: ["findings deliverable with sources"],
    approvalCheckpoints: [],
    verificationRequirements: [],
    riskSummary: "entirely read-only research — no external changes are made.",
    unsupported: [],
  };
}

function organizeFilesPlan(goal: string): CompiledPlan {
  return {
    normalizedGoal: goal,
    successCriteria: [
      "every renamed file is listed on the approval card before anything changes",
      "the new names are read back from storage as evidence",
      "no file's contents are altered and nothing is deleted",
    ],
    assumptions: [
      "this organizes the documents in your cosigno workspace — it does not reach into your computer's own folders or a connected drive.",
    ],
    questions: [],
    steps: [
      { idx: 0, purpose: "work out a consistent name for each file", operator: "files", tool: "files.organize", dependsOn: [] },
      { idx: 1, purpose: "write the mission receipt", operator: "chief", tool: "mission.receipt", dependsOn: [] },
    ],
    expectedDeliverables: ["a consistently named workspace"],
    approvalCheckpoints: ["renaming your files requires your approval — every rename is on the card"],
    verificationRequirements: ["files.organize: read the names back from storage after the rename"],
    riskSummary:
      "renames only, and only after you approve them. contents are never edited and nothing is ever deleted.",
    unsupported: [
      "files stored outside cosigno — on your computer, or in a connected drive — can't be renamed or moved.",
    ],
  };
}

/**
 * Writing something. The research step comes FIRST and is not optional: a
 * document written from nothing is the failure mode this whole shape exists
 * to avoid, so the plan gathers material before it writes, and the writing
 * tool marks the document when the material turned out not to cover it.
 */
function writePlan(goal: string, manifest: CapabilityManifest): CompiledPlan {
  const canWrite = manifest.tools.some((t) => t.id === "deliverable.write");
  if (!canWrite) return unsupportedPlan(goal);
  return {
    normalizedGoal: goal,
    successCriteria: [
      "the document is written from material this mission actually gathered or you attached",
      "anything the material didn't cover is said plainly rather than invented",
    ],
    assumptions: [
      "cosigno researches the subject first, then writes from what it found and from anything you attached.",
    ],
    questions: [],
    steps: [
      { idx: 0, purpose: "gather material on the subject", operator: "browser", tool: "web.research", dependsOn: [] },
      { idx: 1, purpose: "write the document", operator: "files", tool: "deliverable.write", dependsOn: [0] },
      { idx: 2, purpose: "write the mission receipt", operator: "chief", tool: "mission.receipt", dependsOn: [] },
    ],
    expectedDeliverables: ["a written document, saved to your files"],
    approvalCheckpoints: [],
    verificationRequirements: [],
    riskSummary: "entirely read-only — the document is saved to your cosigno files and sent nowhere.",
    unsupported: [],
  };
}

/**
 * Why this goal can't run, in the words of the thing that's actually missing.
 *
 * A single catch-all sentence about money and publishing was wrong for two of
 * the three cases it covered, and being told the wrong reason is barely better
 * than being told nothing. Each branch also says what cosigno CAN do, because
 * "no" without a next step is where a person gives up on the product.
 */
function unsupportedReason(goal: string): string {
  const g = goal.toLowerCase();
  if (/\b(essay|post|posts|blog|article|story|script|copy|deck|slides?|presentation|newsletter|brief|memo|letter|website|app)\b/.test(g)) {
    return "writing a document needs the AI operator, which isn't configured on this deployment — so cosigno won't hand you a page and call it written. ask it to research the subject and it will give you the material, with sources.";
  }
  return "this goal requires moving money or publishing through a connection that isn't available — cosigno can research and prepare, but can't complete it.";
}

function unsupportedPlan(goal: string): CompiledPlan {
  return {
    normalizedGoal: goal,
    successCriteria: [],
    assumptions: [],
    questions: [],
    steps: [],
    expectedDeliverables: [],
    approvalCheckpoints: [],
    verificationRequirements: [],
    riskSummary: "this goal needs a capability cosigno doesn't have yet.",
    unsupported: [unsupportedReason(goal)],
  };
}

/**
 * One repair pass, driven by the validation report: drop steps with unknown
 * tools or forbidden operators, add a generic approval checkpoint if a
 * consequential step lacks one, and label a live+sandbox mix. Never invents
 * capability — it only removes what can't run and annotates honestly.
 */
function repair(plan: CompiledPlan, result: ValidationResult, manifest: CapabilityManifest): CompiledPlan {
  const drop = new Set<number>();
  for (const issue of result.issues) {
    if ((issue.code === "unknown_tool" || issue.code === "operator_forbidden") && issue.stepIdx !== undefined) {
      drop.add(issue.stepIdx);
    }
  }
  let steps = plan.steps.filter((s) => !drop.has(s.idx));
  // Prune dangling dependencies on dropped steps.
  const kept = new Set(steps.map((s) => s.idx));
  steps = steps.map((s) => ({ ...s, dependsOn: s.dependsOn.filter((d) => kept.has(d)) }));

  const next: CompiledPlan = { ...plan, steps };
  if (result.issues.some((i) => i.code === "missing_approval_gate") && next.approvalCheckpoints.length === 0) {
    next.approvalCheckpoints = ["a consequential step requires your approval before it runs"];
  }
  if (result.issues.some((i) => i.code === "mixed_data")) {
    next.assumptions = [...next.assumptions, "this plan mixes live and sandbox steps — each step is labeled with its source."];
  }
  if (result.issues.some((i) => i.code === "unverifiable_claim")) {
    next.unsupported = [...next.unsupported, "some steps can't be automatically verified — those outcomes are shown as unverified."];
  }
  void manifest;
  return next;
}

function buildPlan(shape: GoalShape, goal: string, manifest: CapabilityManifest): CompiledPlan {
  switch (shape) {
    case "meeting_prep":
      return meetingPrepPlan(goal);
    case "product_compare":
      return productComparePlan(goal, manifest);
    case "github":
      return githubPlan(goal);
    case "research":
      return researchPlan(goal, manifest);
    case "organize_files":
      return organizeFilesPlan(goal);
    case "write":
      return writePlan(goal, manifest);
    default:
      return unsupportedPlan(goal);
  }
}

function willDoFrom(plan: CompiledPlan): string[] {
  return plan.steps
    .filter((s) => s.tool !== "mission.receipt")
    .map((s) => s.purpose);
}

export async function compileMission(
  userId: string,
  goal: string,
  sources: SourceContext[] = []
): Promise<CompileResult> {
  const manifest = await buildCapabilityManifest(userId);
  const shape = classify(goal);

  /**
   * ADAPTIVE FIRST, SHAPES AS THE FLOOR.
   *
   * The shapes below are good at the handful of goals they were written for
   * and silently wrong outside them — a request about apartments matched the
   * "compare" keyword and got the plan built for laptops. So when a planner is
   * configured, the goal is planned against the live capability manifest
   * instead, which is what lets cosigno take on work nobody wrote a shape for.
   *
   * The adaptive plan is already validated by the time it arrives (the planner
   * discards anything that doesn't pass), and it is built from the same tool
   * registry, so it inherits every approval gate and verification rule. If
   * there is no planner, or it returns nothing usable, the deterministic shape
   * runs exactly as before — the adaptive path can improve a plan, never
   * weaken one.
   */
  const adaptive =
    shape === "unsupported"
      ? null
      : await planAdaptively({
          userId,
          goal,
          manifest,
          plan: "unknown",
          // Names and read-status only. Extracted file/page CONTENT never
          // reaches the planner, so a poisoned source cannot shape the plan.
          sourceNotes: sources.map(describeSource),
        });

  if (adaptive) {
    const willDo = willDoFrom(adaptive);
    const usableSources = sources.filter(sourceIsUsable);
    if (usableSources.length > 0) {
      willDo.unshift(
        `read the ${usableSources.length} source${usableSources.length === 1 ? "" : "s"} you provided and use ${usableSources.length === 1 ? "it" : "them"} as context`
      );
    }
    return {
      understood: {
        normalizedGoal: adaptive.normalizedGoal,
        willDo,
        boundary:
          adaptive.approvalCheckpoints[0] ??
          (adaptive.unsupported[0]
            ? `boundary: ${adaptive.unsupported[0]}`
            : "cosigno will research and prepare — nothing consequential runs without your approval."),
        informationProvided: [`Your request: "${goal.trim()}"`, ...sources.map(describeSource)],
      },
      plan: adaptive,
      validation: { ok: true, issues: [] },
      blocked: false,
      shape,
    };
  }

  let plan = buildPlan(shape, goal, manifest);

  const informationProvided = [`Your request: "${goal.trim()}"`, ...sources.map(describeSource)];
  const usable = sources.filter(sourceIsUsable);

  if (shape === "unsupported") {
    return {
      understood: {
        normalizedGoal: goal,
        willDo: [],
        boundary: plan.unsupported[0] ?? "this goal isn't supported yet.",
        informationProvided,
      },
      plan,
      validation: { ok: false, issues: [{ code: "empty_plan", detail: "no executable steps." }] },
      blocked: true,
      shape,
    };
  }

  let validation = validatePlan(plan, manifest);
  if (!validation.ok) {
    plan = repair(plan, validation, manifest);
    validation = validatePlan(plan, manifest);
  }

  const boundary =
    plan.approvalCheckpoints[0] ??
    (plan.unsupported[0] ? `boundary: ${plan.unsupported[0]}` : "cosigno will research and prepare — nothing consequential runs without your approval.");

  const willDo = willDoFrom(plan);
  if (usable.length > 0) {
    willDo.unshift(
      `read the ${usable.length} source${usable.length === 1 ? "" : "s"} you provided and use ${usable.length === 1 ? "it" : "them"} as context`
    );
  }

  return {
    understood: { normalizedGoal: plan.normalizedGoal, willDo, boundary, informationProvided },
    plan,
    validation,
    blocked: !validation.ok || plan.steps.length === 0,
    shape,
  };
}
