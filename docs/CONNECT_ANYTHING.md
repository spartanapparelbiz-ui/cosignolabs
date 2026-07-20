# Connect to almost anything — permission rules, boundaries, dry-run

The eighth evolution moves Cosigno from a fixed integration catalog toward a
flexible **responsibility layer across your tools** — while keeping the hard
rules every prior evolution has kept: **preserve everything that works, never
fake capability, never expose or regenerate a secret, and let nothing cross the
Boundary without your approval or signature.**

This increment is deliberately **honest about scope**. The expansion brief lists
68 capabilities, many explicitly "future". Rather than stub 68 buttons, this
evolution ships a small number of *genuinely working* pieces on top of the
already-substantial integrations system, and documents the rest truthfully (see
the map at the end).

## What shipped in this increment (real, tested, offline-capable)

### 1. Custom permission rules (§11, and the spending side of §61)

A standing policy over what Cosigno may do, **written in plain language** and
turned into a **visible, editable, structured** rule — then actually enforced.

- **Deterministic parser** (`src/lib/rules.ts`, no model call): `parsePermissionRule`
  turns "never refund more than $200 without my signature" into
  `{ target: payment, verb: refund, condition: amount > 200, requirement: sign }`.
  The same code runs client-side for an instant live preview and server-side for
  storage, so what you see is what gets enforced.
- **The hard invariant — rules can only ever *tighten*.** `applyRequirementToTier`
  can raise an action's tier (require approval / signature) or **block** it, but
  it can never lower the server's floor. Feeding arbitrary user text through the
  parser can therefore only strengthen a boundary, never weaken one. This is
  unit-proven (`tests/rules.test.ts`).
- **Enforced at the single connector door.** `proposeConnectorAction` — the one
  place any integration reaches the outside world — loads the user's rules and
  folds them in *after* the server tier is resolved. A matching "never" rule
  returns an honest refusal (and logs `rule_blocked`); a "sign"/"approve" rule
  raises the tier and notes why on the card. Amount-conditioned rules ("sign
  above $200", "never above $Z") give real **spending boundaries** at the door.
- Storage: new `permission_rules` table (`0020_permission_rules.sql`, RLS,
  service-role writes), store methods on both backends, `/api/rules` +
  `/api/rules/[id]`. The agent never writes rules — only the user does.
- UI: a **permission rules** section on Connections with a live structured
  preview and per-rule on/off + delete.

### 2. Dry-run / action preview (§13 sandbox, §14 preview, §37 dry-run)

"Show me what you would do" — computed, **never done**.

- `previewConnectorAction` (`src/lib/integrations/runtime/preview.ts`) is a
  structural clone of the propose path's *resolution* half, stopped before any
  card exists. It computes the **same tier and the same rule decision** the real
  proposal would (sharing `ruleContext.ts` so the two can't drift), and renders
  the exact request — method, resolved URL, args — with the credential's
  **placement shown but its value never loaded**. It decrypts nothing, calls no
  provider, creates no action card, sends nothing, and increments no usage.
  Proven in `tests/preview.test.ts` (including "the real secret appears nowhere
  in the payload" and "no action card is created").
- Surfaced as a **dry run** button beside every "propose", opening a preview
  modal that always states: *"nothing was sent, no credential was read, and no
  approval was created."*

### 3. Explicit data + action boundaries / trust review (§9, §10, §26)

`src/lib/integrations/boundaries.ts` derives — **never invents** — a plain-English
boundary from what a provider already declares: what it **can access** (its
scope summary), the **universal guarantees** it can't cross, and every action
with its tier and requirement. This static boundary is surfaced as a "can access
/ cannot" panel on each app card. `effectiveBoundary` additionally folds the
user's rules (raising or blocking actions) and is exercised in tests; the live
per-action *rule effect* a user sees today is surfaced through the **dry-run
preview** (which reports "raised to signature" / "blocked" for the specific
action) and the **rules list**, rather than being re-rendered inside each card's
boundary panel.

### 4. OpenAPI import (§5)

Paste an OpenAPI/Swagger document; `parseOpenApi` (`src/lib/integrations/openapi.ts`,
deterministic) detects each operation and assigns the **same safe-default risk
tier** the manual builder uses (GET→read, writes→write, DELETE→destructive). It
**fetches nothing, stores nothing, holds no secret, executes nothing** — it only
reads the document. You review the detected actions, then create the tool through
the *existing* SSRF-checked, encrypted `/api/connections/custom` path. Wired into
the "add API tool" form.

## What already existed (reused, not rebuilt)

The integrations system was already rich; this increment leans on it rather than
replacing it:

- **Connections hub** with third-party apps, **custom MCP servers** (add / test /
  per-tool enable + consent / risk tiers), and **custom API tools** (base URL +
  auth placement + mapped actions + risk tiers + propose).
- **7 real OAuth providers** (Gmail, Google Calendar, Google Drive, Outlook,
  GitHub, Slack, Notion), each gated by `isConfigured()` — shown honestly as
  "coming soon" until their env is set. No fake "connected".
- Server-side **secret encryption + masking** (`INTEGRATIONS_ENCRYPTION_KEY`),
  **SSRF** guards on every custom URL, **connection health** + status
  (connected / needs_reauth / error / revoked), disconnect/reconnect.
- The **Boundary engine**: every connector capability becomes a proposed card
  through `proposeConnectorAction`; the server assigns the tier from the
  capability's risk class and a connector can never lower it.
- **Activity / audit** logging of every action, and **scheduled automations**
  (the existing standing-order/watch engine).

## The full brief, mapped honestly

`REAL-NOW` = shipped this increment · `EXISTS` = already in the product ·
`PARTIAL` = partly real, rest documented · `FUTURE` = documented, not built, not
faked.

| # | Section | Status | Note |
|---|---------|--------|------|
| 1 | Integrations hub / CONNECTIONS | EXISTS + PARTIAL | Page exists with apps/MCP/custom sections + rules; the literal 5-tab Connected/Available/Custom/Internal/Developer split is future. |
| 2 | Built-in integrations | EXISTS | 7 real OAuth providers (gated → "coming soon"); the longer catalog is future and shown as such. |
| 3 | Custom integrations (API + REST action builder) | EXISTS | Custom API tools: base URL, auth placement, mapped actions. |
| 4 | Natural-language integration setup | PARTIAL | NL→structured **rules** ship now; conversational *connect* flow is future. |
| 5 | OpenAPI import | **REAL-NOW** | Deterministic parse → detected actions → existing custom path. |
| 6 | Custom tool schemas | PARTIAL | Actions carry method/path/risk today; full inputs/outputs/verification schema is future. |
| 7 | Internal systems | PARTIAL | Any internal REST API works via custom API tools now; deeper internal connectors future. |
| 8 | Database connections | FUTURE | Not built; would need a DB connector + per-table grants. |
| 9 | Data boundaries | **REAL-NOW** | `boundaries.ts`, derived + explicit. |
| 10 | Action boundaries | **REAL-NOW** | Per-action tier + plain requirement. |
| 11 | Custom permission rules | **REAL-NOW** | Parser + store + enforcement (tighten-only). |
| 12 | Connection test mode | EXISTS + REAL-NOW | MCP "test" exists; dry-run preview adds a safe read/preview. |
| 13 | Sandbox | **REAL-NOW** | Dry-run simulates without executing. |
| 14 | Action preview | **REAL-NOW** | Renders the exact request, no secret. |
| 15 | Verification adapters | FUTURE | Concept documented; not built. |
| 16 | Integration recipes | FUTURE | — |
| 17 | Custom delegation recipes | FUTURE | Delegations exist; reusable recipes are future. |
| 18 | Triggers | PARTIAL | Scheduled automations exist; event triggers/webhooks future. |
| 19 | Custom inbound webhooks | FUTURE | — |
| 20 | Outbound webhooks | FUTURE | — |
| 21 | Developer mode | FUTURE | — |
| 22 | Cosigno API | FUTURE | Would reuse the same Boundary model; not exposed yet. |
| 23 | SDK direction | FUTURE | Not built (no fake SDK). |
| 24 | Embedded Cosigno | FUTURE | — |
| 25 | Integration marketplace | FUTURE | — |
| 26 | Integration trust review | **REAL-NOW** | Boundary disclosure per connection. |
| 27 | Connection health | EXISTS | Status + health re-check. |
| 28 | Automatic reauth handoff | PARTIAL | `needs_reauth` + reconnect exist; auto-pause-affected-delegations future. |
| 29 | Rate-limit awareness | PARTIAL | Route rate limits enforced; provider-throttle backoff future. |
| 30 | Connection priority | FUTURE | — |
| 31 | Cross-integration delegations | PARTIAL | The planner can already span connected tools in one delegation. |
| 32 | Cross-integration state | FUTURE | Some signals via Autopilot; true cross-tool reconciliation future. |
| 33 | Conflict detection | FUTURE | — |
| 34 | Source of truth | FUTURE | — |
| 35 | Data freshness | PARTIAL | Connections carry `last_health_at`; per-source freshness UI future. |
| 36 | Action logging | EXISTS | Activity ledger + audit; rules add audit rows. |
| 37 | Dry run | **REAL-NOW** | Preview. |
| 38 | Plan inspector | PARTIAL | Dry-run is a per-action inspector; full multi-step plan inspector future. |
| 39 | Smart fallbacks | FUTURE | — |
| 40 | Local tools | FUTURE | — |
| 41 | Cosigno Connector | FUTURE | — |
| 42 | Custom buttons | FUTURE | — |
| 43 | Custom views | FUTURE | — |
| 44 | Universal object model | FUTURE | — |
| 45 | Identity resolution | FUTURE | — |
| 46 | Cosigno commands for integrations | PARTIAL | "never send Slack without asking" now becomes a real rule; broader command routing future. |
| 47 | Integration discovery | FUTURE | — |
| 48 | Connection onboarding | FUTURE | — |
| 49 | Custom builder experience | PARTIAL | Basic mode (connect API / import OpenAPI / map actions / tiers / propose) exists; advanced mode future. |
| 50 | Custom transforms | FUTURE | — |
| 51 | Human-in-the-loop transforms | FUTURE | — |
| 52 | Integration versioning | FUTURE | — |
| 53 | Safe deprecation | FUTURE | — |
| 54 | Enterprise connection control | PARTIAL | Workspaces + roles exist; org-level integration policy future. |
| 55 | Team-scoped secrets | FUTURE | — |
| 56 | Connection ownership | FUTURE | — |
| 57 | Secret rotation | FUTURE | Disconnect + re-add works; in-place rotation future. |
| 58 | Offboarding safety | PARTIAL | `deleteAllUserData` covers personal data incl. rules; team transfer future. |
| 59 | Integration analytics | PARTIAL | Activity ledger; dedicated analytics future. |
| 60 | Cost awareness | FUTURE | — |
| 61 | Spending boundaries | PARTIAL | Amount-conditioned rules ("sign above $X", "never above $Z") enforce at the connector door now; full budget ledger future. |
| 62 | High-risk action mode | EXISTS | Tier 3 + typed confirmation. |
| 63 | Production deployment integrations | FUTURE | — |
| 64 | GitHub delegations | PARTIAL | GitHub provider exists (gated); delegations use it, not a mini-app. |
| 65 | Sales delegations | PARTIAL | Works through connected CRM/email once configured. |
| 66 | Ecommerce delegations | PARTIAL | Works through Shopify/Stripe once configured. |
| 67 | Founder delegations | EXISTS | The core delegation loop already serves these. |
| 68 | The ultimate connection experience | FUTURE | The vision this evolution moves toward. |

## Guarantees (verifiable)

- **No secret leaves the server.** The dry-run preview never loads or decrypts a
  credential; it renders placement only (`Authorization: Bearer ••••`). Tested.
- **No bypass.** Rules and preview never lower a tier; real execution stays
  exclusively on propose → approve → execute. Tested.
- **No fake capability.** Every new control does something real; providers that
  aren't configured stay "coming soon"; OpenAPI import says plainly it only read
  a document.
- **Demo mode still works** with no env: parser, rules, preview, boundaries, and
  OpenAPI import all run fully offline.
