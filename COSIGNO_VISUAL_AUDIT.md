# Cosigno — Complete Visual Screenshot Audit

A full visual pass over the **real running product** — no mockups, no faked
screens. Every image below was captured from the app running locally against
its own code, driven through Playwright/Chromium. Where a screen, state, or
flow could not be reached, that is documented plainly rather than skipped or
invented.

---

## How this was captured

- **App**: the actual Next.js app from this repo, `npm run dev` on
  `http://localhost:3400`. No product code was modified for the audit.
- **Mode**: **demo mode** (no secrets set) — in-memory store, offline
  deterministic planner, single `demo-user`. This is the project's own
  supported local setup; no credentials were invented and no keys, env vars,
  integrations, auth, or database behavior were changed. The one honest
  consequence is that several surfaces show "not configured / sample data"
  banners (connections, mission execution) — those are captured as-is because
  they are what a fresh deployment actually shows.
- **Demo data**: seeded only through the app's own public API (the same
  endpoints a user hits) — a signed-and-executed email (→ receipt with seal),
  two proposals parked at the boundary, one completed delegation, an objective
  with three linked delegations, and a temporary-authority grant. No real
  personal data; all names/addresses are safe demo values
  (`recipient@example.com`, "Nicholas", "john", "sarah").
- **Secrets**: none exposed. No tokens, keys, private emails, or real customer
  data appear in any screenshot. The "operator" identity is the demo user.
- **Dimensions**: desktop **1440×900** context (full-page captures), mobile
  **390×844**.
- **Capture log**: machine log of every shot (path, note, ok, any console/JS
  errors) is at [`screenshots/_capture-log.json`](screenshots/_capture-log.json).
  **Zero uncaught JS or console errors** were recorded across all captured
  screens.

### A note on load timing (affects reading the raw log)

Several data-backed pages (delegations, NOW home, connections, autopilot,
account panels) render **skeleton placeholders first** and hydrate their real
content ~1–5s later. The first automated pass captured a few of these mid-skeleton;
those were **re-captured with a longer settle** so the primary screenshots show
real content. The skeleton-on-load behavior is itself a finding (see #6) — but
the committed images reflect the true populated state.

### What could NOT be reproduced (documented, not faked)

| Item | Why it isn't shown |
|------|--------------------|
| **Blocked / failed delegation** state (and the "rescue this" action, which only appears on blocked work) | Demo mode has no failing executor — every tier-1 action succeeds and every tier-2/3 action waits at the boundary. A failed/blocked delegation cannot be produced without a real integration that can fail. Not simulated. |
| **"Take Over This Thread" / Threads** as a distinct surface | Not implemented as its own screen. The closest shipped capability is **Live Takeover** on the Boundary (captured). |
| **"Clean Up After Me"** | Not implemented as a named feature/surface. |
| **Real Clerk-hosted sign-in/up** | Clerk is unconfigured in demo mode, so the app's own custom `/sign-in` + `/sign-up` pages render instead (captured). |
| **Live third-party connections** (Gmail, Calendar, etc.) | All show "coming soon" with connect disabled until `INTEGRATIONS_ENCRYPTION_KEY` is set — captured as the honest real state. |

---

## The screenshots

Legend for the per-screen notes: **Polished** = looks finished/shippable ·
**Unfinished** = incomplete, placeholder, or non-functional · **Inconsistent**
= conflicts with another screen/pattern · **Next** = the improvement to make.

### 1 · Marketing

| Screen | Route | State | File | Notes |
|--------|-------|-------|------|-------|
| Landing | `/` | Public, above+below fold | `01-marketing/landing-desktop.png` | **Polished**: strong hero ("tell cosigno what you need done."), live command demo card, clear CTAs. **Unfinished**: large empty beige bands between the hero, the demo command bar, the 3 proof cards, and the footer — two of the three proof cards are "coming soon" (walkthrough video, real receipt). **Inconsistent**: a floating dark "N" avatar chip sits mid-left over empty space with no apparent purpose on a public page. **Next**: tighten vertical rhythm (kill the dead bands), ship or hide the "coming soon" proof cards, remove/relocate the stray presence chip on marketing. |
| Product | `/product` | Public | `01-marketing/product-desktop.png` | Marketing detail page. Review for the same vertical-spacing rhythm as landing. |
| Operators | `/operators` | Public | `01-marketing/operators-desktop.png` | Audience/positioning page. |
| Pricing | `/pricing` | Public, monthly | `01-marketing/pricing-desktop.png` | **Polished**: clean 3-tier layout, interactive "actions/month" slider, FAQ accordion, "most popular" on pro. **Inconsistent (major)**: plans are **free $0 / pro $29 / max $99** — this does **not** match the intended "Personal $22.20 / Pro $55.50 / Business $99.90" naming or pricing (see top inconsistency #1). **Next**: reconcile plan names + prices across marketing, `src/lib/plans.ts`, and the account "plan & usage" panel. |
| Security | `/security` | Public | `01-marketing/security-desktop.png` | Trust/security narrative page. |
| Templates | `/templates` | Public | `01-marketing/templates-desktop.png` | Templates/skills marketing. |
| Demo | `/demo` | Public | `01-marketing/demo-desktop.png` | Public demo page. |
| Privacy | `/privacy` | Public | `01-marketing/privacy-desktop.png` | Legal — polished, readable. |
| Terms | `/terms` | Public | `01-marketing/terms-desktop.png` | Legal — polished, readable. |

### 2 · Auth & onboarding

| Screen | Route | State | File | Notes |
|--------|-------|-------|------|-------|
| Sign in | `/sign-in` | Empty form | `02-auth/sign-in-desktop.png` | **Polished**: custom-designed split layout ("it signs as you do." + animated mark), email/password, "create an account" link. **Inconsistent**: the "sign in" button renders in the disabled-looking peach tone (same as an inactive "Delegate" button) even at rest, reading as disabled. **Next**: give the primary auth button its active (solid orange) state. |
| Sign up | `/sign-up` | Empty form | `02-auth/sign-up-desktop.png` | Mirrors sign-in styling. |
| Onboarding 1–3 | `/app` (first-run) | Intro dialog, screens 1/2/3 | `02-auth/onboarding-1-desktop.png`, `-2-`, `-3-` | **Polished**: calm 3-step first-run intro ("see how it works" → "one more thing"). Sets the product's tone well. |

### 3 · NOW / Home

| Screen | Route | State | File | Notes |
|--------|-------|-------|------|-------|
| NOW / home | `/app` | Populated (1 needs you, objective, temp authority, state stream) | `03-now/now-home-desktop.png` | **Polished**: dense-but-calm command center — delegation composer with suggestion chips, CURRENT STATE line (0 moving · 1 need you · 0 watching · 0 blocked), right rail (Objectives, You're Needed, Watching, Hold, Temporary Authority, State Stream, What cosigno can do, Connected apps). All right-rail counts agree with the header badge. **Inconsistent**: the left **NOW** and **COMPLETED** columns speak of "missions" ("Nothing is being worked on", "Finished missions will appear here") while completed *delegations* live under "command threads" on a different page — the mission/delegation split is confusing (#3). Content uses the demo planner's placeholder phrasing ("the recipient named in your command"). **Next**: unify "missions vs delegations vs command threads" into one noun; surface completed delegations here. |
| NOW + briefing | `/app` | Morning briefing card shown | `03-now/now-briefing-desktop.png` | **Polished**: "Good evening. While you were away: 7 things moved forward…" with "Start briefing". Nice re-entry moment. |
| Capabilities | `/app` | "What can you do right now" expanded | `03-now/now-capabilities-desktop.png` | **Polished/honest**: capability report driven by real connected apps + tier settings; never advertises what isn't connected. |
| Presence command overlay | `/app` (Ctrl/Cmd-K) | Overlay open | `03-now/presence-command-overlay-desktop.png` | **Polished**: keyboard-driven command surface. |
| Cosigno Hold active | `/app` | External actions held | `03-now/cosigno-hold-active-desktop.png` | **Polished**: black hold banner + "Resume cosigno"; the authority-brake state reads clearly. |

### 4 · Delegations

| Screen | Route | State | File | Notes |
|--------|-------|-------|------|-------|
| Delegations list | `/app/missions` | 4 delegations (complete ×3, boundary ×1) | `04-delegations/delegations-list-desktop.png` | **Polished**: each "command thread" shows real momentum (executed/vetoed/failed counts, progress bar, status pill) + contextual actions (brief me / finish this / replay / handle this the same way next time; "review N decision" on boundary rows). **Unfinished/honest**: red banner "background mission execution isn't configured — missions advance only while this page is open." (real infra gap, transparently surfaced). **Inconsistent**: route is `/app/missions` but the page, nav, and copy all say "delegations" — URL noun mismatch (#3). **Next**: rename the route to `/app/delegations`; wire background execution or soften the banner. |
| Brief modal | `/app/missions` → brief me | "Brief" dialog | `04-delegations/delegation-brief-desktop.png` | **Polished/honest**: deterministic brief ("Why: nothing is pending…", "Next: finish this…", "Toward: Launch the company by August 1") — every line maps to real action status. |
| Replay | `/app/missions` → replay | Replay timeline | `04-delegations/delegation-replay-desktop.png` | Replay/trace of a delegation's steps. |

### 5 · Objectives

| Screen | Route | State | File | Notes |
|--------|-------|-------|------|-------|
| Objectives list | `/app/objectives` | 1 objective | `05-objectives/objectives-list-desktop.png` | **Polished**: outcome-level layer above delegations, with rolled-up progress. |
| Objective detail | `/app/objectives/[id]` | "Launch the company by August 1", 1/3 complete | `05-objectives/objective-detail-desktop.png` | **Polished**: derived progress bar (1/3), "2 delegations are at your boundary", linked delegation rows with per-item momentum, link/mark-achieved/delete. Progress is computed from real state — correct and trustworthy. |

### 6 · The Boundary / Handoff / Sign

| Screen | Route | State | File | Notes |
|--------|-------|-------|------|-------|
| Boundary / Focus | `/app/focus` | "I need your decision · 1 more after this" | `06-boundary/boundary-focus-desktop.png` | **Polished**: the emotional core — Cosigno↔You track, "review all N together", the prepared email card, "cosigno recommends", and the why-me line ("external actions always wait for your signature"). **Inconsistent**: nav labels this "boundary" but the route is `/app/focus`. Content is demo-planner placeholder ("recipient@example.com", "(from your command)"). |
| Approval bundle | `/app/focus` → Review all | Bundle view | `06-boundary/approval-bundle-desktop.png` | **Polished**: batch multiple decisions into one review. |
| Live Takeover | `/app/focus` → I'll take it from here | "You have control", editable | `06-boundary/live-takeover-desktop.png` | **Polished**: hand-off of control with editable payload. This is the shipped "Take Over" capability. |
| Continue From Here | `/app/focus` → Cosigno continue | Handed back | `06-boundary/continue-from-here-desktop.png` | **Polished**: control handed back to the operator. |
| Sign dialog | `/app/focus` → Sign | Signature surface | `06-boundary/sign-dialog-desktop.png` | **Polished**: the Cosigno Sign surface (draw canvas + name field). |
| Signature drawn | `/app/focus` | Signature drawn, ready | `06-boundary/signature-drawn-desktop.png` | **Polished**: drawn ink + "Sign to authorize". |
| Signature sealed | `/app/focus` | "Signed by Nicholas" + seal | `06-boundary/signature-sealed-desktop.png` | **Polished (product highlight)**: "SIGNED", drawn mark, **Cosigno seal** in the corner, "Authorized through Cosigno · 11:35 PM". The single most finished moment in the product. |

### 7 · Watch / Standing Orders

| Screen | Route | State | File | Notes |
|--------|-------|-------|------|-------|
| Watch & standing orders | `/app/watch` | List/empty | `07-watch/watch-standing-orders-desktop.png` | **Polished**: ongoing responsibilities framing. |
| New standing order | `/app/watch` → new | Create form, trust modes | `07-watch/standing-order-create-desktop.png` | **Polished**: name, "what should it do", cadence, and the three **trust modes** (observe / prepare [default] / operate) with honest scope copy ("signed and locked actions always wait for you"). Clean and complete. |

### 8 · Activity / Receipts / Seal

| Screen | Route | State | File | Notes |
|--------|-------|-------|------|-------|
| Activity ledger | `/app/activity` | Filters + rows | `08-activity/activity-ledger-desktop.png` | **Polished**: every proposed/approved/vetoed/executed action, filters (status/level/category), search, export CSV. |
| Trust Receipt | `/app/activity` → view receipt | Receipt modal | `08-activity/trust-receipt-desktop.png` | **Polished**: "Prepared by / Authorized by / Authorization / Permission used / Authorized at / Executed / Status / Result / Outcome" + tamper-evident record hash. Honest "Executed — the outcome has not been independently verified." |
| Trust Receipt — trace | `/app/activity` → trace | Trace expanded | `08-activity/trust-receipt-trace-desktop.png` | **Polished**: the sealed hash + trace. **Note**: the audit captured the receipt for a tier-1 *auto* action first; the signed-email receipt (with "Signed by") is one row up. |

### 9 · Connections

| Screen | Route | State | File | Notes |
|--------|-------|-------|------|-------|
| Connections | `/app/connections` | All apps "coming soon" | `09-connections/connections-desktop.png` | **Honest/unfinished**: banner "the server isn't configured to store credentials yet (`INTEGRATIONS_ENCRYPTION_KEY`)". All 7 apps (Gmail, Calendar, Drive, Outlook, GitHub, Slack, Notion) show **"coming soon"** with connect disabled; custom MCP + custom API-tool sections present but empty. **Inconsistent**: marketing and in-app capability copy imply connectable tools, but the entire surface is non-functional here. **Next**: either enable at least one connector in a demo-safe way, or make "coming soon" the honest headline everywhere it's referenced. |

### 10 · Settings / Account

| Screen | Route | State | File | Notes |
|--------|-------|-------|------|-------|
| Settings landing | `/app/settings` | Landing | `10-settings/settings-desktop.png` | Settings entry. |
| Account center | `/app/account` | Default tab | `10-settings/account-desktop.png` | **Polished**: tabbed account center. **Inconsistent**: tab labels are "plan & usage" / "connections" but the routes/ids are `usage` / `integrations` — internal-vs-visible naming drift. |
| Permissions | `/app/account` → permissions | Tier board | `10-settings/account-permissions-desktop.png` | **Polished**: the 3-tier board (auto / approve / locked) with per-category hints. Core to the product's promise. |
| Profile | `/app/account` → profile | Profile panel | `10-settings/account-profile-desktop.png` | Profile settings. |
| Security | `/app/account` → security | Security panel | `10-settings/account-security-desktop.png` | Security settings + recent auth actions. |
| Plan & usage | `/app/account/plan` | Usage ring + plan | `10-settings/account-usage-desktop.png` | **Polished**: usage ring + plan info. **Inconsistent**: plan naming/pricing must agree with `/pricing` (#1). |
| Connections (in account) | `/app/account?tab=integrations` | Integrations panel | `10-settings/account-integrations-desktop.png` | **Inconsistent (duplication)**: this renders the full Connections screen again — the same surface exists at `/app/connections` and as an account tab (#4). |

### 11 · Other app surfaces

| Screen | Route | State | File | Notes |
|--------|-------|-------|------|-------|
| Skills | `/app/skills` | Marketplace | `12-misc/skills-desktop.png` | Skills = preconfigured watch/rule bundles. |
| Files (Take This) | `/app/files` | Files | `12-misc/files-desktop.png` | File intake / "Take This" entry point. |
| My Rules & Memory | `/app/memory` | Empty | `12-misc/rules-memory-desktop.png` | **Polished**: "memory is on" toggle, "remember that…" input, empty state. Personal operating rules, plainly framed. |
| Team | `/app/team` | Team | `12-misc/team-desktop.png` | Team surface (single-user beta). |
| Workspace | `/app/workspace` | Shared delegations | `12-misc/workspace-desktop.png` | Shared/workspace delegations. |
| Deployment health | `/app/health` | Status board | `12-misc/health-desktop.png` | **Polished/honest**: mission execution (not configured), cron (no), DB (in-memory dev), planner (no), browser (sandbox). A genuinely useful "no secrets, just status" page. |
| Autopilot | `/app/autopilot` | Sample data | `12-misc/autopilot-desktop.png` | **Very polished but tonally off**: a dense business-intelligence dashboard (health 50/100, signals, forecast $84,084 vs $100k, business map funnel, "what should we do next"). Clearly labeled "Sample data". **Inconsistent (major)**: this reads like a *different product* than the calm, minimal approval-first operator around it (#2). |
| Decisions inbox | `/app/decisions` | 1 waiting | `12-misc/decisions-inbox-desktop.png` | **Polished**: "1 decision waiting — nothing has been taken without you", Sign/edit/veto. **Inconsistent**: shows the *same* pending decision that also appears on `/app/focus` (Boundary) and the NOW "You're Needed" card — three routes for one approval queue (#5). |

### 12 · States

| Screen | Route | State | File | Notes |
|--------|-------|-------|------|-------|
| Watch — empty | `/app/watch` | No standing orders | `13-states/watch-empty-desktop.png` | Clean empty state. |

### Mobile (390×844)

| Screen | File | Notes |
|--------|------|-------|
| Landing | `mobile/landing-mobile.png` | Responsive; hero + demo stack cleanly. |
| Pricing | `mobile/pricing-mobile.png` | 3 tiers stack vertically; slider works. |
| NOW / home | `mobile/now-home-mobile.png` | **Responsive** but: top nav truncates ("…bou" for boundary) instead of a proper mobile menu, and the floating "N" presence chip **overlaps the "Choose apps" button** (#7). Captured showing the hold-active state. |
| Delegations | `mobile/delegations-mobile.png` | Command threads stack. |
| Objectives | `mobile/objectives-mobile.png` | Progress + linked rows stack. |
| Boundary / Focus | `mobile/boundary-focus-mobile.png` | Decision card fits mobile. |
| Watch | `mobile/watch-mobile.png` | Standing orders on mobile. |
| Activity | `mobile/activity-mobile.png` | Ledger on mobile. |
| Connections | `mobile/connections-mobile.png` | "Coming soon" cards on mobile. |
| Sign dialog | `mobile/sign-dialog-mobile.png` | **Polished**: the signature surface adapts to mobile. |

---

## The 10 biggest visual / product inconsistencies

1. **Pricing/plan mismatch (naming + numbers).** The app ships **free $0 /
   pro $29 / max $99** (in `/pricing`, `src/lib/plans.ts`, and the account
   "plan & usage" panel), which does **not** match the intended **Personal
   $22.20 / Pro $55.50 / Business $99.90**. Names and prices need to be
   reconciled in one place and propagated everywhere they're shown.

2. **Autopilot feels like a different product.** `/app/autopilot` is a dense,
   data-heavy BI dashboard (health scores, signals, forecast, business-map
   funnel) sitting inside an otherwise calm, minimal, approval-first operator.
   The two design languages don't share type scale, density, or tone — it
   reads as bolted-on, and it's on "sample data" with no obvious path to real
   data.

3. **"Missions" vs "delegations" vs "command threads" — one thing, three
   names, mismatched URL.** The NOW home's left columns talk about "missions",
   the list page is titled "delegations" and grouped under "command threads",
   and the route is `/app/missions`. Same concept, three labels and a URL that
   doesn't match the visible name.

4. **The approval queue appears on three separate screens.** The single pending
   decision shows up on the Boundary (`/app/focus`), the Decisions inbox
   (`/app/decisions`), **and** the NOW "You're Needed" card — with slightly
   different framing each time. It's unclear which is canonical.

5. **Connections is duplicated and entirely non-functional.** The same
   Connections surface exists at `/app/connections` and as the account
   "connections" tab; every integration is "coming soon" with connect disabled
   pending `INTEGRATIONS_ENCRYPTION_KEY`. Honest, but it means a headline
   product capability is a dead end in this build, in two places.

6. **Skeleton-on-load flashes empty screens.** Delegations, NOW home,
   connections, autopilot, and the account panels render placeholder skeletons
   for ~1–5s before content hydrates. On a slow first paint they look empty or
   broken (the initial automated pass caught several fully blank). Needs faster
   first paint or content-preserving skeletons.

7. **Stray floating "N" presence chip.** A dark circular avatar chip is pinned
   mid-left on essentially every page — including public marketing pages — over
   empty space, and on mobile it **overlaps the "Choose apps" button**. It
   reads as a misplaced/orphaned element.

8. **Demo planner produces robotic placeholder content in prominent places.**
   The boundary/decision cards say "send the follow-up email to **the recipient
   named in your command**" to "**recipient@example.com**" with body "**(from
   your command)**". The planner doesn't extract the entity ("john"/"sarah")
   from the command, so the most trust-critical screens show placeholder text.

9. **Landing page vertical rhythm + unfinished proof.** The landing page has
   large empty beige bands between sections, and two of its three social-proof
   cards are "coming soon" (walkthrough video, real receipt). The most-viewed
   page looks half-dressed.

10. **Mobile navigation truncates instead of collapsing.** The top nav row runs
    off-screen on mobile ("…bou" for boundary) rather than collapsing into a
    menu, and the primary auth button renders in a disabled-looking tone at
    rest. Small but they undercut polish on first impression.

---

*Generated by a read-only visual audit against the real running app. No product
code, secrets, environment variables, or integrations were modified. Capture
tooling: `scripts/visual-audit.mjs` (+ `scripts/seed-demo.mjs` for demo data).*
