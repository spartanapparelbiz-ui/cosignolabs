# The Workspace Model — a digital twin of every connected system

Cosigno already builds a **digital twin** of each connected app: its resource
types, the operations on each, and the authority each one requires
(`src/lib/twin/model.ts`). The Workspace Model is the layer above that — **one
graph, one vocabulary, one place to reason** — so an AI can understand, search,
plan against and safely rehearse a change *before* anything touches production.

The rule that governs this whole surface, unchanged from every prior evolution:
**never fake capability, and never claim state you have not observed.**

## What it is — and what it deliberately is not

The Workspace Model is **not a copy of your data.** It models *structure*:

| Modelled | How it is derived |
| --- | --- |
| Objects | Provider-declared actions → resource types (`buildTwin`) |
| Relationships | Canonical containment + cross-connector identity (`graph.ts`) |
| Permissions | One `Domain.Object.Verb` vocabulary (`canonical.ts`) |
| Business rules | The existing category floors + blast radius + permission rules |
| Reversibility | Whether the connector exposes a real inverse operation |
| State | **Only** where a connector genuinely synced instances |
| Dependencies | Graph walk over causal edges (`dependencies.ts`) |

Where a resource has not been synced, the model reports `synced_count: null` and
the UI says *"not synced"* — never `0`. Where a dependency report cannot count
records, it names the affected object **types** and says so in its caveats. An
invented number in an impact report is precisely the number a human uses to
decide whether to approve, so it must be real or absent.

## The pieces that shipped (real, tested, offline-capable)

All of it is deterministic — no model call anywhere in this layer — so a plan is
replayable, a query answers the same way twice, and an audit six months from now
reproduces the same graph. Covered by `tests/workspace-model.test.ts` (61 tests).

### 1. Universal object graph — `src/lib/workspace-model/graph.ts`

Every connector is projected onto one graph: `workspace → connector → resource →
operation`, plus the permission each operation requires. Two kinds of
relationship carry the interesting weight:

- **`references`** — canonical containment inside a connector (an invoice
  belongs to a customer). Drawn **only when both objects exist** in that
  connector's twin; the graph never invents a relationship to an object the
  system doesn't expose.
- **`same_as`** — the same canonical object exposed by two systems is one
  business object seen twice. This is what makes impact analysis cross vendor
  boundaries instead of stopping at the connector.

### 2. Canonical objects, schema mapping, permission mapping — `canonical.ts`

`cust`, `customer`, `acct_id` and `Account` all normalize onto one canonical
type; anything unrecognized stays `generic` **with its own name** rather than
being filed under a domain it doesn't belong to. `mapSchema` maps external field
names onto canonical fields and **reports what it could not map** instead of
guessing. `permissionFor` collapses every vendor's permission vocabulary into
one model (`Finance.Refund`, `Repository.Write`, `CRM.Account.Write`), and
`businessActionName` turns `POST /customers/refund` into "Refund customer" — the
level at which a human can meaningfully approve.

### 3. Dependency engine — `dependencies.ts`

"What breaks if I touch this?" — walked across systems, bounded by depth, with
the severity escalating by reach and by whether the action is destructive. Reads
score `none`. Every report carries its caveats, including the depth bound and
the honest statement when no record counts were observed.

### 4. Natural-language query — `query.ts`

A deterministic parser extracts intent (find / impact / permission / capability)
plus filters for connector, canonical object, risk and reversibility, then runs
them over the graph. Every result ships the **interpretation** that produced it
and the words it **could not use** — a query that silently ignores half its
input gives false confidence.

### 5. Planning engine — `plan.ts`

A task never executes. It becomes an eight-step plan — locate → verify → policy
→ simulate → estimate → approve → execute → confirm — where **only the execute
step mutates anything**, and every step is inspectable first. A step whose
operation is not declared by the model is **blocked**, and a plan with a blocked
step is not executable: the planner cannot route around the model by inventing
an endpoint. Planning against a disconnected connector blocks too, rather than
failing halfway through.

### 6. Changeset preview — `changeset.ts`

A pull request for the real world: added / modified / deleted, affected systems,
estimated cost, blast-radius risk, required permissions, rollback plan, and the
authority needed to approve it. Authority is the **max** of the twin's tier
floor, the blast radius, and the operation's category — it can be raised here,
never lowered. Changeset ids are content-derived, so the same proposed change is
recognizable as the same change.

### 7. Rollback engine — `rollback.ts`

The undo is computed **before** execution, from the model: the inverse of a
`create` is the connector's own `delete`; the inverse of an `update` is the same
update replayed with the captured *before* values. Where no inverse exists the
change is marked irreversible and says why — it never claims an undo it cannot
perform. Recreating a deleted record requires a signature and states plainly
that the new record is not the original. Money, and anything already sent
downstream, is explicitly **not** un-done by a rollback.

### 8. Execution diff — `diff.ts`

Before → after per field, with signed deltas (money formatted as money), plus
counters for objects added/modified/deleted, permissions and secrets. Two
honesty properties: a diff with no observed execution is labelled as **planned
figures**, and any field the execution changed that the approved changeset did
not predict is surfaced as **unexpected**.

### 9. Live synchronization — `sync.ts`

Each connector declares how it stays current — webhook where the provider
pushes, stream where it holds a connection open, **poll as the fallback that
always works** (assuming a webhook that isn't wired means believing a model that
nothing is updating). Every connector reports its age against a per-mode
freshness budget; past it, it is **stale**, and a connected-but-never-observed
system is stale rather than fresh. `reconcile` resolves conflicts in favour of
production and flags fields the remote never reported as *unresolved* rather
than blanking them.

## Surfaces

| Route | What it does |
| --- | --- |
| `GET /api/workspace-model` | The graph + live-sync report |
| `POST /api/workspace-model/query` | Deterministic NL query (read-only) |
| `GET /api/workspace-model/dependencies` | Impact of touching one node |
| `POST /api/workspace-model/plan` | Execution plan + changeset + predicted diff |
| `POST /api/workspace-model/rollback` | Rollback plan + the impact of running it |
| `/app/workspace-model` | Explorer (zoom/pan/filter), Query, Plan a change |

**None of these routes can execute anything.** They call no provider and touch
no credential; execution stays where it already lives — an approved action on
the ledger, gated by the existing authority engine.

## Where the model actually does work

For a while the model was a diagram: it explained things on a page nobody had
to visit, while the real gate (`runtime/propose.ts`) validated capabilities
against `provider.listActions()` independently. A model that nothing depends on
is decoration, so it now carries one load-bearing job.

**Every approval card reads its undo from the model.** Before a person approves
a connector action, `previewForActions` asks the twin the question the tier
cannot answer: *if this is wrong, can we take it back?*

- The undo for a create is that connector's **own declared delete** — named on
  the card (`cosigno can undo this by running delete_widget on Acme`).
- If the connector declares no inverse, the card says the action is
  **permanent** rather than implying a rescue that doesn't exist.
- An **update reports that no before-state was captured**, because a connector
  call carries the values going in and never the values already there. Offering
  to "restore" fields it has never seen would be the single most dangerous lie
  this surface could tell.
- If the connection no longer declares the operation — a withdrawn MCP tool, a
  deleted connector — the card says so **before** anyone approves something that
  can't run as described.

The preview explains; it never gates. Tier, authority, and every existing floor
are untouched, and a failure to build the model omits the preview rather than
blocking the queue.

## Identity, and why it is the whole ballgame

A twin is keyed by **connection id**, never by provider key. Every custom MCP
server is stored with `provider_key: "mcp"` and every generic API connector
with `"custom"`, so keying by provider merges two unrelated servers into one
model — and a merged model will happily offer an undo operation that belongs to
somebody else's server. Custom API connectors are modelled too, from the action
set the user mapped; they used to be dropped silently.

Derivation lives in `src/lib/twin/collect.ts` and **fails loudly**. If the store
can't be read it throws instead of returning an empty model, because an empty
model is not "no connections" — it is "we don't know", and rendering the second
as the first turns a database blip into a page confidently claiming a workspace
has no tools, or a live capability into one that looks withdrawn.

## Honest scope map

The brief describes a larger platform than one increment can genuinely ship.
What is **not** here, stated plainly rather than stubbed:

- **Connector builder UI, marketplace, versioning UI, custom connector UI
  builder, multi-language SDKs.** The existing custom-connector paths
  (`/api/connections/custom`, OpenAPI import, MCP) are unchanged and still the
  way to add a connector; the schema mapper and permission mapper shipped here
  are the pieces a builder would sit on top of.
- **Real record sync.** Nothing in this increment fetches records, so nearly
  every resource reports "not synced" — visibly, by design. `syncedCounts` is
  wired end to end and populates the moment a connector genuinely syncs.
- **One-click rollback execution.** The rollback *plan* is computed, previewed,
  priced and gated; running it is an approved action like any other and is not
  auto-executed from this surface.
- **A twins browser.** `/app/twins`, its component, and `GET /api/twin` were
  deleted. A per-app capability catalog is a developer's view; an operations
  manager approving a refund never needs it, and the model earns its place on
  the approval card instead. The twin module remains as the substrate.
- **Streaming/webhook ingestion.** Sync *modes* are modelled and reported
  honestly; the ingestion plumbing itself is not part of this increment, which
  is why every connector's freshness is shown rather than assumed.

## The Universal Action Model

A user should never have to ask "can cosigno do this?" — only "can the
connected system do this?". That only holds if every action, from every kind of
connection, describes itself in the same shape. `actionSpec.ts` produces that
shape for a first-party provider, an MCP server, and an API somebody imported
ten minutes ago, identically:

| Field | Where it comes from |
| --- | --- |
| Name | the Action Library — one name per capability, everywhere |
| Description | the connector's own summary |
| Inputs | an MCP input schema, or a custom connector's path parameters |
| Expected result | the mutation class |
| Permissions | the canonical permission model |
| Risk + why | the four-level risk module |
| Approval | the tier the server assigned |
| Validation | required inputs, tier floors, reversibility, standing policy |
| Success criteria | the mutation class — always about the outcome |
| **Verification** | the read operation on that resource that would confirm it |
| Rollback | the rollback engine's real inverse operation |

Two properties carry the weight:

**`inputs_declared` is a field.** "This connector didn't declare its inputs" is
a real answer, and it is not the same as "this action takes nothing". A model
that renders the second when it means the first invites someone to approve a
call with no idea what it will send.

**Verification names the operation.** Completion means the outcome happened,
not that a request was accepted, so every write carries the read that would
prove it: *"cosigno runs list_products afterwards and confirms the product
carries the new values."* Where the connector exposes no way to read the object
back, `possible: false` — and the spec says cosigno can only report that the
request was accepted, and will say exactly that. `coverageOf` totals this per
connection, so a user can see where the guarantees thin out before they rely on
them rather than after.

That gap is real and worth seeing: a connector with `create_refund` but no way
to list refunds can issue money movements cosigno cannot confirm landed.
