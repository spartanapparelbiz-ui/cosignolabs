# Cosigno — Complete Visual Screenshot Audit

A full visual pass over the **real running product** — no mockups, no faked
screens. Every image below was captured from the app running locally against
its own code, driven through Playwright/Chromium. Where a screen, state, or
flow could not be reached, that is documented plainly rather than skipped or
invented.

**This walkthrough is ordered to follow the audit request itself** — landing →
sign in/up → onboarding → Home/Now → Delegations (+ states) → Take This →
Handoff → The Boundary → Approve → Sign → signature animation → Signed →
Cosigno Seal → Receipts → Activity → Watch → Standing Orders → Briefings →
Decision Queue → Return Points → Threads → Objectives → Settings → Connections
→ Permission settings → Trust modes → Personal operating rules → Temporary
authority → Approval bundles → Live Takeover → Continue From Here → Rescue →
Finish This → Clean Up After Me → Take Over This Thread → Brief Me → What
Changed → Why Is This Waiting → Do Everything You Can → mobile → empty/loading/
error/success states → modals/overlays → navigation → unfinished/inconsistent
pages (plus pricing/billing). Screenshot **files stay grouped by section in
`screenshots/`** (as requested); this document is the ordered index into them.

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

### A note on load timing

Several data-backed pages (delegations, NOW home, connections, autopilot,
account panels) render **skeleton placeholders first** and hydrate their real
content ~1–5s later. The first automated pass captured a few of these
mid-skeleton; those were **re-captured with a longer settle** so the committed
screenshots show real content. The skeleton-on-load behavior is itself a
finding (see inconsistency #6).

### What could NOT be reproduced (documented, not faked)

| Item (in request order) | Why it isn't shown |
|-------------------------|--------------------|
| **Blocked / failed delegation** state + **Rescue** (only appears on blocked work) | Demo mode has no failing executor — tier-1 actions always succeed, tier-2/3 always wait at the boundary. A failed/blocked delegation can't be produced without a real integration that can fail. Not simulated. |
| **Return Points** ("return only if …") | Ships as configuration inside standing orders / rules, not as its own screen. No standalone surface to capture. |
| **Threads** / **Take Over This Thread** | Not implemented as a distinct surface. Closest shipped capability is **Live Takeover** on the Boundary (captured). |
| **Clean Up After Me** | Not implemented as a named feature/surface. |
| **Do Everything You Can** as its own screen | Ships as a *continuation mode* behind the same "finish this" affordance, not a separate screen. The affordance is captured; the mode isn't a distinct view. |
| **Real Clerk-hosted sign-in/up** | Clerk is unconfigured in demo mode, so the app's own custom `/sign-in` + `/sign-up` render instead (captured). |
| **Live third-party connections** | All show "coming soon", connect disabled until `INTEGRATIONS_ENCRYPTION_KEY` is set — captured as the honest real state. |

---

## Walkthrough — in request order

Legend: **Polished** = looks finished/shippable · **Unfinished** = incomplete/
placeholder/non-functional · **Inconsistent** = conflicts with another screen/
pattern · **Next** = the improvement to make.

### 1 · Landing
`/` — `screenshots/01-marketing/landing-desktop.png` · mobile `screenshots/mobile/landing-mobile.png`
**Polished**: strong hero ("tell cosigno what you need done."), live command
demo card, clear CTAs. **Unfinished**: large empty beige bands between hero →
demo bar → 3 proof cards → footer; two proof cards are "coming soon"
(walkthrough video, real receipt). **Inconsistent**: a floating dark "N" avatar
chip sits mid-left over empty space on a public page. **Next**: tighten vertical
rhythm, ship/hide the "coming soon" proof, remove the stray chip on marketing.

*Supporting marketing pages* (same visual system, review for the same vertical
rhythm): Product `01-marketing/product-desktop.png`, Operators
`01-marketing/operators-desktop.png`, Security `01-marketing/security-desktop.png`,
Templates `01-marketing/templates-desktop.png`, Demo `01-marketing/demo-desktop.png`,
Privacy `01-marketing/privacy-desktop.png`, Terms `01-marketing/terms-desktop.png`.

### 2 · Pricing / billing
`/pricing` — `screenshots/01-marketing/pricing-desktop.png` · mobile `screenshots/mobile/pricing-mobile.png`
(billing/plan also in-app at `/app/account/plan` — `screenshots/10-settings/account-usage-desktop.png`)
**Polished**: clean 3-tier layout, interactive "actions/month" slider, FAQ
accordion, "most popular" on pro. **Inconsistent (major, #1)**: plans are
**free $0 / pro $29 / max $99** — this does **not** match the intended
"**Personal $22.20 / Pro $55.50 / Business $99.90**" naming/pricing. **Next**:
reconcile names + prices across `/pricing`, `src/lib/plans.ts`, and the account
plan panel.

### 3 · Sign in / Sign up
`/sign-in` — `screenshots/02-auth/sign-in-desktop.png` · `/sign-up` — `screenshots/02-auth/sign-up-desktop.png`
**Polished**: custom split layout ("it signs as you do." + animated mark),
email/password, "create an account". **Inconsistent**: the "sign in" button
renders in the disabled-looking peach tone at rest, reading as inactive.
**Next**: give the primary auth button its solid active state.

### 4 · Onboarding — REMOVED
`/app` (first-run intro) — `screenshots/02-auth/onboarding-1-desktop.png`, `-2-`, `-3-`
**Superseded.** There is no onboarding any more, and the screenshots above are
a record of what used to be here rather than what is. The intro asked a
first-time visitor which part of their week stole the most time — a reasonable
question, asked at the one moment nobody can answer it, because they have not
yet seen what the answers do. It stood between someone and the only thing that
teaches this product anything: typing a sentence and watching something happen.
Home now opens on the ask box with six worked examples underneath, which
carries the same lesson with no gate in front of it. The Playwright suite
asserts the absence: `a first-time visitor lands straight in the product`.

### 5 · Home / Now
`/app` — `screenshots/03-now/now-home-desktop.png` · mobile `screenshots/mobile/now-home-mobile.png`
**Polished**: dense-but-calm command center — delegation composer with
suggestion chips, CURRENT STATE line, right rail (Objectives, You're Needed,
Watching, Hold, Temporary Authority, State Stream, What cosigno can do,
Connected apps). Right-rail counts agree with the header badge. **Inconsistent
(#3)**: the left NOW/COMPLETED columns speak of "missions" while completed work
lives under "command threads" elsewhere. **Next**: unify the noun; surface
completed delegations here.
Related NOW captures: capabilities card `03-now/now-capabilities-desktop.png`;
Cosigno Hold active `03-now/cosigno-hold-active-desktop.png`.

### 6 · Delegations (+ states)
`/app/missions` — `screenshots/04-delegations/delegations-list-desktop.png` · mobile `screenshots/mobile/delegations-mobile.png`
**Polished**: each "command thread" shows real momentum (executed/vetoed/failed
counts, progress bar, status pill) + contextual actions. Captured **states**:
- **completed** — "clear my inbox of newsletters", "…thank-you email to sarah", "…launch update to the design team" (status pill *complete*).
- **needs-you / waiting** — "…follow-up email to john" (pill *at the boundary · 1*, "review 1 decision"). Also the full Boundary view in §8.
- **active / moving** — the *moving* momentum state (no item currently mid-run because demo missions only advance while the page is open — see the banner below).
- **blocked / failed** — **not reproducible in demo** (no failing executor); documented, not faked.
**Unfinished/honest**: red banner "background mission execution isn't
configured — missions advance only while this page is open." **Inconsistent**:
route is `/app/missions` but page/nav/copy say "delegations" (#3).

### 7 · Take This
`/app/files` — `screenshots/12-misc/files-desktop.png`
The "Take This" intake entry point (drop a file/link/text for cosigno to take
on). Also reachable from the Home composer's "Add file / Add link".

### 8 · Handoff / The Boundary
`/app/focus` — `screenshots/06-boundary/boundary-focus-desktop.png` · mobile `screenshots/mobile/boundary-focus-mobile.png`
**Polished**: the emotional core — Cosigno↔You track, "review all N together",
the prepared email card, "cosigno recommends", and the why-me line ("external
actions always wait for your signature"). This *is* the Handoff/Boundary
moment. **Inconsistent**: nav labels it "boundary" but the route is `/app/focus`;
content is demo-planner placeholder ("recipient@example.com", "(from your
command)", #8).

### 9 · Approve flow
`/app/decisions` — `screenshots/12-misc/decisions-inbox-desktop.png` (also the Boundary card in §8)
**Polished**: "1 decision waiting — nothing has been taken without you" with
**Sign / edit / veto**. Approving executes, vetoing kills, nothing runs on its
own. **Inconsistent (#4)**: the same pending decision also appears on the
Boundary and the NOW "You're Needed" card.

### 10 · Sign flow
`/app/focus` → Sign — `screenshots/06-boundary/sign-dialog-desktop.png` · mobile `screenshots/mobile/sign-dialog-mobile.png`
**Polished**: the Cosigno Sign surface (draw canvas + name field), with the
why-signature framing.

### 11 · Signature animation (drawing)
`/app/focus` → drawn — `screenshots/06-boundary/signature-drawn-desktop.png`
**Polished**: live drawn ink on the canvas, name filled, "Sign to authorize"
enabled — the mid-signature frame.

### 12 · Signed state
`/app/focus` → sealed — `screenshots/06-boundary/signature-sealed-desktop.png`
**Polished (product highlight)**: "SIGNED", the drawn mark, "Signed by
Nicholas", "Authorized through Cosigno · 11:35 PM".

### 13 · Cosigno Seal
same frame — `screenshots/06-boundary/signature-sealed-desktop.png` (seal in the corner) · and on receipts `screenshots/08-activity/trust-receipt-desktop.png`
**Polished**: the Cosigno mark seals the signed card, and the sealed record
carries into the audit trail as a tamper-evident hash.

### 14 · Receipts
`/app/activity` → view receipt — `screenshots/08-activity/trust-receipt-desktop.png`; trace `screenshots/08-activity/trust-receipt-trace-desktop.png`
**Polished**: Prepared by / Authorized by / Authorization / Permission used /
Authorized at / Executed / Status / Result / Outcome + tamper-evident record
hash, with an honest "the outcome has not been independently verified." **Note**:
the captured receipt is the tier-1 *auto* action; the signed-email receipt
(with "Signed by") is one row up in the ledger.

### 15 · Activity
`/app/activity` — `screenshots/08-activity/activity-ledger-desktop.png` · mobile `screenshots/mobile/activity-mobile.png`
**Polished**: every proposed/approved/vetoed/executed action, filters
(status/level/category), search, export CSV.

### 16 · Watch
`/app/watch` — `screenshots/07-watch/watch-standing-orders-desktop.png` · mobile `screenshots/mobile/watch-mobile.png` · empty state `screenshots/13-states/watch-empty-desktop.png`
**Polished**: ongoing-responsibilities framing with a clean empty state.

### 17 · Standing Orders
`/app/watch` → new — `screenshots/07-watch/standing-order-create-desktop.png`
**Polished**: name, "what should it do", cadence, and the three trust modes.
Complete and well-designed.

### 18 · Briefings
`/app` (briefing card) — `screenshots/03-now/now-briefing-desktop.png`
**Polished**: "Good evening. While you were away: 7 things moved forward…" with
"Start briefing". Strong re-entry moment.

### 19 · Decision Queue
`/app/decisions` — `screenshots/12-misc/decisions-inbox-desktop.png`
**Polished**: the full queue of everything awaiting sign-off. (Same surface as
the Approve flow, §9; see #4 for the three-surface overlap.)

### 20 · Return Points
**Documented, no standalone screen.** "Return only if …" ships as configuration
within standing orders and rules rather than as its own page — visible where
those are set (§17, §27), not as a separate surface.

### 21 · Threads / Take Over This Thread
**Not implemented as a distinct surface** (documented, not faked). The shipped
equivalent of taking over an in-flight thread is **Live Takeover** on the
Boundary — see §30.

### 22 · Objectives
`/app/objectives` — `screenshots/05-objectives/objectives-list-desktop.png`; detail `screenshots/05-objectives/objective-detail-desktop.png` · mobile `screenshots/mobile/objectives-mobile.png`
**Polished**: outcome layer above delegations; detail shows derived progress
(1/3), "2 delegations are at your boundary", linked rows with per-item momentum,
link / mark-achieved / delete. Progress is computed from real state — correct
and trustworthy.

### 23 · Settings
`/app/settings` — `screenshots/10-settings/settings-desktop.png`; account center `/app/account` — `screenshots/10-settings/account-desktop.png`
**Polished**: tabbed account center. **Inconsistent**: tab labels "plan &
usage" / "connections" but route ids `usage` / `integrations` — naming drift.
Supporting panels: Profile `10-settings/account-profile-desktop.png`, Security
`10-settings/account-security-desktop.png`, Plan & usage
`10-settings/account-usage-desktop.png`.

### 24 · Connections
`/app/connections` — `screenshots/09-connections/connections-desktop.png` · mobile `screenshots/mobile/connections-mobile.png` · (also as account tab `10-settings/account-integrations-desktop.png`)
**Honest/unfinished**: banner "the server isn't configured to store credentials
yet (`INTEGRATIONS_ENCRYPTION_KEY`)". All 7 apps (Gmail, Calendar, Drive,
Outlook, GitHub, Slack, Notion) show "**coming soon**", connect disabled;
custom MCP + API-tool sections present but empty. **Inconsistent (#5)**: the
same surface is duplicated in the account tab and is non-functional in this
build.

### 25 · Permission settings
`/app/account` → permissions — `screenshots/10-settings/account-permissions-desktop.png`
**Polished**: the 3-tier board (auto / approve / locked) with per-category
hints. Core to the product's promise.

### 26 · Trust modes
`/app/watch` → new — `screenshots/07-watch/standing-order-create-desktop.png`
**Polished**: observe / prepare (default) / operate, with honest scope copy
("signed and locked actions always wait for you").

### 27 · Personal operating rules
`/app/memory` — `screenshots/12-misc/rules-memory-desktop.png`
**Polished**: "memory is on" toggle, "remember that…" input, clean empty state.
Explicit rules override inferred ones; hard boundaries stay server-enforced.

### 28 · Temporary authority
`/app` (NOW right rail) — `screenshots/03-now/now-home-desktop.png` (Temporary Authority card: "record updates — automatic · expires 1:32 AM · revoke")
**Polished**: scoped, expiring, revocable grant surfaced on Home. No standalone
page — it lives as a NOW-rail card (and is honestly excluded from signed/locked
actions).

### 29 · Approval bundles
`/app/focus` → Review all — `screenshots/06-boundary/approval-bundle-desktop.png`
**Polished**: batch multiple decisions into one review ("review all N
together").

### 30 · Live Takeover
`/app/focus` → I'll take it from here — `screenshots/06-boundary/live-takeover-desktop.png`
**Polished**: "you have control", editable payload — the shipped "take over"
capability.

### 31 · Continue From Here
`/app/focus` → Cosigno continue — `screenshots/06-boundary/continue-from-here-desktop.png`
**Polished**: control handed back to cosigno after a takeover.

### 32 · Rescue
**Affordance captured, blocked-state not reproducible.** "Rescue this" only
renders on a **blocked** delegation, which demo mode cannot produce (no failing
executor). The button lives in `DelegationActions` and in the Brief modal when
failures exist; documented, not faked.

### 33 · Finish This
`/app/missions` → brief — `screenshots/04-delegations/delegation-brief-desktop.png` ("Finish this" CTA); also on continuable delegation rows in the list (§6)
**Polished/honest**: continues the delegation on the same planner pipeline;
says "I have it." on success, or an honest "couldn't move forward safely"
otherwise.

### 34 · Clean Up After Me
**Not implemented** (documented, not faked). No named feature/surface exists.

### 35 · Take Over This Thread
**Not implemented as a distinct surface** — same note as §21; see Live Takeover
(§30).

### 36 · Brief Me
`/app/missions` → brief me — `screenshots/04-delegations/delegation-brief-desktop.png`
**Polished/honest**: deterministic brief — momentum, counts, one-sentence
"why", the single most useful "next", and the linked objective. Every line maps
to a real action status.

### 37 · What Changed
`/app` briefing "while you were away" — `screenshots/03-now/now-briefing-desktop.png`; State Stream on Home `03-now/now-home-desktop.png`; Autopilot "what changed" `12-misc/autopilot-desktop.png`
**Polished**: three honest reads of change — the re-entry briefing, the live
State Stream (Signed/Completed/Vetoed/Prepared events with timestamps), and the
Autopilot change summary.

### 38 · Why Is This Waiting
`/app/missions` → brief — `screenshots/04-delegations/delegation-brief-desktop.png` (the "**Why:**" line)
**Polished/honest**: "Why: nothing is pending — 1 step completed and nothing is
waiting" (or the boundary/blocked reason) — grounded in real state.

### 39 · Do Everything You Can
**Continuation mode, not a distinct screen.** Ships behind the same "finish
this" affordance (§33) as the "everything" mode — still stops at the boundary.
The affordance is captured; there's no separate view to show.

### 40 · Mobile layouts
`screenshots/mobile/` — landing, pricing, now-home, delegations, objectives,
boundary-focus, watch, activity, connections, sign-dialog.
**Responsive** overall. **Issues**: the top nav truncates ("…bou" for boundary)
instead of collapsing into a menu, and the floating "N" presence chip
**overlaps the "Choose apps" button** on Home (#7).

### 41 · Empty / loading / error / success states
- **Empty**: Watch `13-states/watch-empty-desktop.png`; Rules & Memory `12-misc/rules-memory-desktop.png`; Home NOW/COMPLETED placeholders `03-now/now-home-desktop.png`.
- **Loading**: skeleton-on-load across delegations/connections/autopilot/account — captured behavior, see #6.
- **Error / degraded (honest banners)**: Connections "not configured" `09-connections/connections-desktop.png`; Delegations "background execution not configured" `04-delegations/delegations-list-desktop.png`; Deployment health board `12-misc/health-desktop.png`.
- **Success**: the Signed/sealed state `06-boundary/signature-sealed-desktop.png`; completed delegations `04-delegations/delegations-list-desktop.png`.

### 42 · Modals / overlays
Presence command overlay (Ctrl/Cmd-K) `03-now/presence-command-overlay-desktop.png`;
Brief modal `04-delegations/delegation-brief-desktop.png`; Replay
`04-delegations/delegation-replay-desktop.png`; Trust Receipt
`08-activity/trust-receipt-desktop.png`; Sign dialog `06-boundary/sign-dialog-desktop.png`.
**Polished**: consistent card + backdrop treatment, spring-in animation.

### 43 · Navigation states
Active-tab states are visible across every app shot (the pill highlights now /
delegations / boundary / activity / connections / settings). **Inconsistent**:
route↔label drift (`/app/missions`→"delegations", `/app/focus`→"boundary") and
mobile nav truncation (§40).

### 44 · Unfinished / inconsistent pages (captured on purpose)
- **Autopilot** `12-misc/autopilot-desktop.png` — very rich BI dashboard on "sample data"; tonally a different product (#2).
- **Connections** `09-connections/connections-desktop.png` — all "coming soon" (#5).
- **Deployment health** `12-misc/health-desktop.png` — honest "not configured" status board.
- **Team** `12-misc/team-desktop.png` and **Workspace** `12-misc/workspace-desktop.png` — single-user-beta surfaces.
- **Skills** `12-misc/skills-desktop.png` — preconfigured watch/rule bundles.

---

## The 10 biggest visual / product inconsistencies

1. **Pricing/plan mismatch (naming + numbers).** App ships **free $0 / pro $29
   / max $99** (in `/pricing`, `src/lib/plans.ts`, and the account "plan &
   usage" panel), which does **not** match the intended **Personal $22.20 /
   Pro $55.50 / Business $99.90**. Reconcile in one place and propagate.

2. **Autopilot feels like a different product.** `/app/autopilot` is a dense,
   data-heavy BI dashboard sitting inside an otherwise calm, minimal,
   approval-first operator. Different type scale, density, and tone; on "sample
   data" with no obvious path to real data.

3. **"Missions" vs "delegations" vs "command threads" — one thing, three names,
   mismatched URL.** NOW home says "missions", the list page says "delegations"
   grouped under "command threads", and the route is `/app/missions`.

4. **The approval queue appears on three separate screens.** The single pending
   decision shows on the Boundary (`/app/focus`), the Decisions inbox
   (`/app/decisions`), **and** the NOW "You're Needed" card — different framing
   each time. Unclear which is canonical.

5. **Connections is duplicated and entirely non-functional.** Same surface at
   `/app/connections` and as an account tab; every integration "coming soon",
   connect disabled pending `INTEGRATIONS_ENCRYPTION_KEY`. A headline capability
   is a dead end, in two places.

6. **Skeleton-on-load flashes empty screens.** Delegations, NOW home,
   connections, autopilot, and account panels render placeholder skeletons for
   ~1–5s before hydrating; on slow first paint they look empty/broken.

7. **Stray floating "N" presence chip.** Pinned mid-left on essentially every
   page — including public marketing — over empty space; on mobile it overlaps
   the "Choose apps" button.

8. **Demo planner produces robotic placeholder content in prominent places.**
   The boundary/decision cards say "send the follow-up email to **the recipient
   named in your command**" to "**recipient@example.com**", body "**(from your
   command)**" — the planner doesn't extract the entity ("john"/"sarah") for the
   most trust-critical screens.

9. **Landing page vertical rhythm + unfinished proof.** Large empty beige bands
   between sections; two of three social-proof cards are "coming soon". The
   most-viewed page looks half-dressed.

10. **Mobile navigation truncates instead of collapsing** ("…bou" for
    boundary), and the primary auth button renders in a disabled-looking tone
    at rest — small things that undercut first-impression polish.

---

*Generated by a read-only visual audit against the real running app. No product
code, secrets, environment variables, or integrations were modified. Capture
tooling: `scripts/visual-audit.mjs` (+ `scripts/seed-demo.mjs` for demo data).*
