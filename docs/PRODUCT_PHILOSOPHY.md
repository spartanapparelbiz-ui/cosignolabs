# Product philosophy — the approval layer, and nothing else

Cosigno is not an AI platform, a workflow builder, or a chatbot. It is **the
approval layer between AI and your business**, and every feature has to earn
its place against one promise:

> "AI wants to take an action. Cosigno makes sure it's safe."

The lifecycle is the product:

```
AI requests an action → cosigno intercepts → cosigno explains exactly what will
happen → policies are checked → a human approves, rejects, or automation
handles it → the action executes → everything is logged
```

## Seven screens, seven questions

The shell is exactly seven destinations, and each answers ONE question. If a
screen can't be described in one question, it's two screens.

| Screen | The question | Where it lives |
| --- | --- | --- |
| Dashboard | What needs my attention? | `/app` |
| Approvals | What is AI asking to do? | `/app/approvals` |
| Activity | What has AI already done? | `/app/activity` |
| Policies | What rules protect my business? | `/app/policies` |
| Connections | What tools can AI use? | `/app/connections` |
| Agents | Which AI assistants are connected? | `/app/agents` |
| Settings | How is my organization configured? | `/app/account` |

`AppRail` and `AppNav` carry those seven and no more. Supporting surfaces
(missions, the workspace model, simulation, monitoring, templates, memory,
team, files) are still there and still work — they're reachable from in-page
links, not from the shell, because eleven rail entries is not a product anyone
understands in thirty seconds.

## One setting, one place

Duplicated editors were removed rather than kept in sync:

- The tier board left Settings; **Policies** is now the only place what-AI-may-do
  is edited.
- The rules editor left Connections; it lives on **Policies**, next to the
  requirements it modifies.
- The connections panel left Settings; **Connections** owns it, and the OAuth
  callback now returns to `/app/connections?status=…` instead of a settings tab.
- Pending approvals appear once on the dashboard, at the top, instead of twice.

## Risk in four words

The engine's risk model is five blast levels across five scored dimensions,
with category floors and tiers on top. That richness is right for **deciding**
and wrong for **reading** — nobody approves faster because they saw a 3.4.

`src/lib/risk.ts` is presentation only. It never decides, never lowers a floor,
and answers the two questions a person actually asks:

```
low · medium · high · critical      +      one plain sentence saying why
```

Rules it holds to, unit-proven in `tests/risk.test.ts`:

- **Every level ships with its reason.** A badge without a `because` is
  decoration, and decoration is what makes people click approve without reading.
- **Escalation only.** A payload fact can raise a level; nothing can lower a
  category floor. A one-cent refund is still critical.
- **Unknown is never safe.** An unrecognized blast level reads as high, and an
  injection-flagged action is high at minimum.

The same four words are used on the approval card, the dashboard, the activity
timeline and the agents roster, so "high" means one thing everywhere.

## What an approval looks like

```
cosigno wants to
Refund the duplicate charge for order #1841

WILL
· this returns money to a customer.
· moves $19.94.
· cannot be undone once it runs.

RISK      this returns money to a customer.
APPROVAL  your signature

[ Sign → ]   [ Reject ]        view details · edit values
```

The ask is the largest type on the card, because it's the only sentence a user
must read to decide. Everything technical — the exact payload, the before/after
diff, the raw values — waits behind *view details*. The footer holds one
primary action and one secondary action; editing moved to the details row so it
stays possible without competing for the eye.

"Veto" became **reject** in the interface. The state machine still records
`vetoed` — the vocabulary changed for the human, not for the ledger.

## The Action Library

Every capability, from every kind of connection, is named by one function
(`src/lib/actionLibrary.ts`) — so a capability is called the same thing on the
connections page, the approval card, and inside the model. Two naming schemes
for one capability is two products.

```
create_refund       → Refund customer
merge_pull_request  → Merge pull request
list_repositories   → View repositories
POST /v1/widgets    → never shown
```

Verbs that carry meaning survive — "merge" and "archive" say something "update"
doesn't — and an object the library doesn't recognize keeps the connector's own
word rather than being renamed into something it isn't. HTTP methods, paths and
raw ids are gone from every list a person reads to decide something.

They remain in exactly two places, both of which the user asked for: the dry-run
modal (opened deliberately, to inspect the request that would be sent) and the
REST connector authoring form, where you cannot define an endpoint without
naming it. Authoring a connector is a different job from approving an action.

## The details panel

"View details" opens the seven questions, in the order people ask them: what AI
wants · what will change · who requested it · affected systems · estimated
impact · approval history · audit log. Approval history is read from the
ledger's own events (`GET /api/actions/[id]`), rendered as sentences —
"you approved it · you · Mar 4, 2:14 PM" — not event enums.

The raw payload is at the bottom of that panel behind one more click, because
it is the only part of the card written for an engineer, and the panel exists
so nobody else has to read it.

## Agents are discovered, never declared

`/app/agents` is built from the append-only decision ledger: an assistant is
listed because it actually presented a key and asked cosigno for authority.
Nothing appears there that has never asked for anything, because a connection
nobody made is not a connection. Each row shows what it asked for, how much
cleared automatically, how much waited for a person, how much policy blocked,
and the riskiest thing it has ever requested — the peak, not the average.

## Visual results, not logs

Cosigno should feel like watching work happen, not like reading about it.

**Real objects, never statistics, never JSON** (`src/lib/objectView.ts`).
"Updated 14 records" tells nobody anything. The change cards show the thing
that changed:

```
Product · Hydro Bottle    2 details updated
Price     $22.00 → $26.00
Status    draft  → published
```

The hard rule, unit-proven in `tests/object-view.test.ts`: nothing emits JSON,
a brace, or a raw key. Money reads as money, dates as dates, booleans as
yes/no, a nested object is described in words, and anything matching a secret
name renders as `hidden` and never reaches the client's DOM at all. Where a
payload carries nothing describable, the view reports itself EMPTY and the
caller shows the action's own sentence — there is deliberately no payload
fallback, because a JSON dump is exactly what this replaces.

**Every payload dump is gone, and a test keeps it that way.** They kept coming
back — the activity expansion, the details panel, a mission step's output, the
landing page's demo card, and two JSON textareas — so `tests/no-json-in-ui.test.ts`
now scans every `.tsx` under `src/components` and `src/app` and fails on any
`JSON.stringify` that isn't building a request body or comparing two values,
and on any `<pre>` holding a payload.

Editing values is a field editor (`ValueEditor`), not a JSON textarea: each
scalar becomes a labelled, typed input, and anything that can't be rendered as
a field is shown read-only in words and passed through untouched — the editor
changes what it can draw and never silently drops the rest.

Money is only formatted as money when the payload says it is: `amount_cents`,
or a record carrying its own `currency`. A bare `price: 40` could be dollars,
cents, euros or credits, and stamping "$40.00" on it invents a currency and a
scale nobody observed. On a refund card that is not a formatting bug.

**Five statuses, and only five** (`src/lib/status.ts`): working · waiting ·
needs approval · failed · finished. Mission states like "queued", "verifying"
and "retrying" are engine states, and the engine is not what a person is
looking at, so they collapse onto the five. `finished` covers both "it ran" and
"you rejected it" — that's the lifecycle; the timeline's ✓/✕ carries the
outcome, and conflating the two is how a product ends up with a sixth status.

**Live Flow** on every in-progress task: done steps filled and checked, the
current step pulsing, the rest grey, with one sentence underneath saying where
the work actually is. It replaced "3 of 7 steps complete", which is a number
about work rather than a picture of it.

## The Workspace Map

The node-graph explorer is deleted — the radial SVG, the zoom, the pan, all of
it. Drawing a graph as a graph produces a spiderweb: every system tangled to
every other, and nobody looks at that and knows what their AI works with.

The map is a line, left to right, in the order work flows:

```
GitHub → Stripe → Salesforce → Slack
```

Two rules keep it readable (`tests/workspace-map.test.ts`): one box per
connected SYSTEM, never one per object or operation; and an arrow only where
two neighbours genuinely share a business object. A system's full set of
relationships is still available when you open it — it just isn't drawn as
lines. If a map needs a zoom control, it has stopped being a map.

Clicking a box opens what is inside it: the objects it holds (with "not synced"
wherever cosigno hasn't observed them), and what AI can do there, grouped into
reads, changes and deletes.

## The test

For every feature: can someone understand this in ten seconds? Would a
non-technical operations manager understand it? Does it help someone safely
approve an AI action? If not — simplify it, or take it out of the shell.

## Not done in this pass

Stated plainly rather than half-shipped:

- **The Add Connection wizard** (choose type → authenticate → discover actions →
  pick what AI may do → test) is still the existing add flow. Custom REST,
  OpenAPI import and MCP servers all work today; the guided six-step wizard over
  them does not exist yet. Note that of the nine types the brief lists, four
  (GraphQL, Database, Browser Automation, CLI) have no backend behind them —
  shipping nine tiles would be nine promises and five lies, so the wizard has to
  offer what actually connects and say plainly what doesn't.
- **The connection detail view** (Permissions · Allowed Actions · Recent
  Activity · Connected AI · Settings) is still the existing per-connection card.
  "Connected AI" in particular has no honest source yet: in-app actions come
  from cosigno's own planner, and the decision ledger doesn't record which
  connection an external agent touched, so the section would be decoration
  until that link exists.
- **Per-team approval routing** ("Required approval: Engineering"). Approvals
  route to *you*, and the card says so honestly — inventing a team name the
  system can't enforce would be worse than the plain truth.
- **Deleting the surfaces that left the shell.** They're out of the navigation,
  not out of the codebase. Removing them is a separate, reversible decision and
  belongs in its own change.
