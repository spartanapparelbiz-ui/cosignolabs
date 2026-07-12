# Cosigno rebuild — audit + phased plan

Target: the full "approval-first AI operating layer" spec (missions, authority
system, automations, knowledge, teams, new billing). This document is the
honest audit of what the shipped product already satisfies, what Phase 1
changed, and the coherent phases that remain. Rule of the rebuild: preserve the
tested engine; refactor surfaces on top of it — never stack fakes.

## Audit — what the shipped product already satisfies

| Spec concept | Shipped today as | Status |
|---|---|---|
| Command → plan → preview → approve → execute → verify | command → proposals → action cards → signature → server-side execute → real result + audit | ✅ core engine, tested |
| Action Cards (payload, reason, risk, edit/approve/reject) | ActionCard: summary, mono payload, tier badge, tier_note, injection flag, edit/approve/veto, real result | ✅ |
| Authority: Observe / Prepare / Confirm / Trusted | tiers 1/2/3 (read+draft auto · signature · typed confirm) + the permissions board (move categories = scoped trust; destructive pinned) | ✅ model equivalent; naming pass pending (Phase 2) |
| Authority Center (inspect/modify/revoke) | account → permissions board + connections (scopes, health, disconnect) | ✅ exists; consolidation pending |
| Approvals enforced server-side, idempotent, audited | state machine + typed confirm + audit rows; no execute without logged approval (tested) | ✅ |
| Connections (min scopes, no secrets client-side, disconnect) | Gmail (real), GitHub/Slack/Notion (gated), custom MCP, custom API-key; AES-256-GCM vault, RLS, SSRF, kill switch | ✅ |
| Prompt-injection defense | scan + wrap untrusted; flagged cards never auto-run/shortcut-approve | ✅ tested |
| Activity + audit history + export | /app/activity with filters + CSV (pro) | ✅ |
| Billing (Stripe) + usage limits | free 25 actions / pro $29 / max; server-enforced | ✅ (tier renaming = Phase 4) |
| RLS on tenant tables | all user-owned tables `user_id = auth_uid()` | ✅ |
| Failure states / empty states / branded errors | per-surface; branded 404/500/503 | ✅ |

## Phase 1 — SHIPPED IN THIS PASS

1. **Critical access fix**: middleware matcher narrowed to `/app/*`,
   `/checkout/*`, `/api/*` only. The public site (/, /product, /security,
   /pricing, /templates, legal, auth pages, metadata, assets) never touches
   middleware — Clerk can never handshake/redirect an anonymous visitor.
2. `/api/track` (anonymous analytics beacon) made public in both middleware
   branches — it was silently auth-gated for the visitors it measures.
3. New public pages, all real-content: **/product** (operating loop, authority
   system, action-card anatomy, audit), **/security** (the shipped, tested
   guarantees — no "unhackable" claims), **/templates** (command templates
   runnable in the live sandbox, honest approval-point labels).
4. **robots.ts + sitemap.ts** (app disallowed; marketing indexed).
5. Positioning: hero = "AI that works. nothing moves without your sign-off." +
   the authority subhead; primary CTA **start with cosigno → /sign-up**
   (self-serve restored per the newest spec), secondary "watch a mission ↓".
   Nav: product · templates · security · pricing · sign in · start free.
   Founding-cohort application kept as the secondary close (discovery gold).
6. Smoke harness extended to the new pages.

## Remaining phases (each one shippable + verified on its own)

- **Phase 2 — App IA + naming**: sessions→**Missions** (goal header, plan,
  work timeline from action events, deliverables from results), a **Decision
  Inbox** (Approvals) surface filtering proposed cards, permissions board →
  **Authority Center** with observe/prepare/confirm/trusted naming, nav:
  home · missions · approvals · connections · activity · settings.
- **Phase 3 — Home command center**: composer (modes, suggestions), today
  panel (active/pending/executed/blocked from real data), decision inbox embed.
- **Phase 4 — Billing tiers**: plans SSOT → Free Preview $0 / Founding $24.99 /
  Personal $39.99 / Pro $79.99, Stripe prices, enforcement + tests updated in
  the same commit (marketing pricing changes only WITH the backend).
- **Phase 5 — Automations**: natural-language builder on a new `automations`
  table; trigger→conditions→actions with approval checkpoints, test mode, run
  history, pause/kill; every run flows through the existing propose/approve
  engine (no new execution path).
- **Phase 6 — Knowledge**: uploaded files/notes as scoped, citable context —
  all content untrusted + injection-scanned (the wrapper already exists).
- **Phase 7 — Teams**: Clerk organizations, workspace_id on tenant tables (new
  migration), roles, approval policies, delegated approvals.
- **Phase 8 — Onboarding + in-app templates**: guided first mission in the
  demo workspace; template gallery inside the app.

## v3 directive deltas ("AI operating system that gets things done")

Shipped in the v3 pass: the new positioning (hero, "give cosigno a mission" /
"watch cosigno work"), and a public **/operators** page grounded strictly in
the REAL capability categories (search/summarize · draft/send/post ·
update_record/webhook · spend/payment/refund · delete · connection_call) with
their server-enforced authority ceilings — no fake agent personalities.

Still open from v3, honestly assessed:
- **Browser control** — real infrastructure (isolated browser sessions,
  step-visible driving, approval-gated interactions). Cannot be shipped
  honestly as a pass; a dead "Browser" nav item is worse than none. Own phase,
  significant build.
- **Pricing v3** ($19.99/$49.99/$69.99/$129.99 — the third sheet in three
  directives). Ship ONLY as one coherent commit: plans SSOT + Stripe price IDs
  (founder runs scripts/stripe-setup.ts) + enforcement + tests + marketing.
  Until then the live $29 pro pricing stays — marketing must not outrun the
  backend.
- **In-app operator attribution** — label each action card / activity row with
  its operator group (derived from its real category). Small, honest, next.
- **Memory controls, Files surface, expanded connections (Outlook/Asana/
  ClickUp/Shopify/Stripe), real connector logos everywhere** — phased; the
  connector-logo identity component partially exists (bundled logos).

## "Complete all" ledger (running status vs. the master directive)

DONE (shipped + verified): positioning/hero/CTAs · public site (/product,
/operators, /templates, /security, /demo, SEO) · public-access fix ·
missions surface · decision inbox · operator attribution (cards + activity) ·
home today-panel + committed composer prompt · approval engine (typed confirm,
tier clamp, injection defense) · authority model (observe/prepare/confirm +
scoped trust via the permissions board; destructive pinned) · connections
(Gmail real; custom MCP + custom API-key with SSRF/timeouts/caps) · activity +
CSV export · branded failure states · cost caps · Stripe billing ($29 pro).

SATISFIED BY CONSTRUCTION (no build needed): "material changes invalidate
approval" — approve requires status=proposed and executes atomically in the
same server call; a payload can only be edited BEFORE approval, so what you
sign is exactly what runs. There is no approved-but-unexecuted window to
invalidate. If a background job queue is ever introduced (see Automations),
action versioning + approval invalidation MUST ship with it.

BLOCKED ON FOUNDER DECISIONS (cannot ship honestly without them):
- Pricing v4 sheet ($0/$19.99/$49.99/$69.99/$129.99 — fourth sheet supplied):
  confirm it's final, then it ships as one SSOT+Stripe+enforcement+tests
  commit; requires running scripts/stripe-setup.ts for real price IDs.
- Gmail live activation: GOOGLE_CLIENT_ID/SECRET in Netlify (GMAIL_SETUP.md).
- App keys (Clerk/Supabase/planner) in Netlify for the real signed-in product.

REMAINING BUILD PHASES (in order): automations (recurring missions: table,
scheduler, run history, test mode — every run through the propose/approve
door) → memory controls (view/edit/delete, scoped) → files surface →
calendar/drive/outlook/slack/notion/asana/clickup/shopify/stripe connectors
(each is a provider config + real OAuth app the founder must register) →
teams/household (workspace_id migration, roles, policies) → browser control
(largest: isolated sessions, step-visible driving, approval-gated actions).

Non-negotiables across every phase: the approval state machine stays the only
door to execution; all tenant tables keep RLS; tests stay green per phase; no
fake surfaces — anything not yet live is labeled, never simulated as real.
