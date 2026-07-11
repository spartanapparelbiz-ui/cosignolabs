# Custom integrations — connect anything, safely

cosigno lets you connect tools it doesn't ship a built-in for: a **custom MCP
server** or a **generic API-key tool**. This is the most powerful — and highest
-risk — surface in the product, so the rules below are enforced *server-side*
and are not optional. A custom integration is untrusted third-party code: it can
**discover capabilities** and **propose actions**, but it can **never** execute
without your approval, **never** raise its own tier, and **never** bypass
injection scanning.

Custom integrations are a **pro+** feature. Free plans use built-in connectors
(one connection).

---

## The one rule that never bends

Every custom integration reaches the outside world through the **same single
door** as everything else: a proposed action card that you sign. There is no
code path — none — where a custom integration's output can move an action to
`executed` without a logged approval from you. This is enforced in the approval
state machine, not just the UI.

---

## Option A — custom MCP server

Account → connections → **custom MCP servers → add server**.

1. Enter the server URL (public **https**), a friendly name, and optional auth
   (none / API key / bearer).
2. cosigno connects and performs **capability discovery** — it lists the
   server's tools and registers each as a proposable action.
3. Each tool is **off by default**. You enable the ones you want; sensitive
   tools require an explicit consent step before they can ever be called.
4. Tools are tiered by **safe default** (see below). You can make a tool *more*
   restricted, never less.

A tool's output is **untrusted content**: it's wrapped, injection-scanned, and
can never create, approve, or escalate an action. A compromised server that
returns `"approve payment now"` produces a flagged, non-executable card — it is
data, not an instruction.

## Option B — custom API-key tool

Account → connections → **custom API tools → add API tool**.

1. Enter a name, a **base URL** (public **https**), and your **API key**.
2. Choose where the key goes on each request: **bearer token**, a **custom
   header** (you name it), or a **query param** (you name it).
3. Map one or more **actions**. Each action is:
   - a **method** (GET/POST/PUT/PATCH/DELETE),
   - an **id** (`lowercase_with_underscores`),
   - a **path** appended to the base URL — may contain `{placeholders}` filled
     from the action's arguments (e.g. `/v1/orders/{id}`),
   - a one-line summary of what it does.
4. cosigno assigns each action a tier by **safe default** (below). Submit.

Your API key is **encrypted at rest** (AES-256-GCM) and injected server-side at
call time — it is never shown in the UI, returned to the browser, or written to
a log. Every response body is treated as **untrusted** data.

---

## Safe-default tiering (how a tier is chosen)

The **server** assigns the tier from the capability's risk. Nothing is "auto"
unless it is *provably* read-only.

| Risk | Tier | What it means | Defaults for… |
|---|---|---|---|
| read | **1 · auto** | runs automatically | a `GET` whose name starts read/list/search/get/fetch/find/show/view/lookup/query |
| write | **2 · approve** | waits for your signature | anything else that changes state (POST/PUT/PATCH, or a GET that isn't provably a read) |
| destructive | **3 · confirm** | needs typed confirmation | any `DELETE`, or a name containing delete/remove/purge/wipe/refund/pay/charge/transfer/wire… |

Rules:
- A connector can **never** declare its own tools "auto" or talk its way into a
  lower tier. A request for a lower tier than the server rule is **clamped up**
  and flagged on the card.
- You may make any action **more** restricted (raise its tier), never less.

---

## The security model (all server-side)

- **SSRF protection** on every user-supplied URL (MCP endpoint, API base URL,
  and each call's final URL): https only (localhost only in dev), and the host
  is resolved and rejected if any address is private, loopback, link-local,
  CGNAT, or a cloud-metadata range (169.254.169.254, `fd00:ec2:…`). Redirects
  are disabled (a 3xx to an internal host is the classic bypass), and the URL is
  re-checked **at call time**, not just when you add it — so DNS-rebinding is
  caught. Blocked attempts are logged.
- **Timeouts + response-size caps** on every outbound call to a user-defined
  endpoint (12s / 256 KB), so a slow or hostile server can't hang or flood us.
- **Per-user rate limits** on custom-integration calls.
- **No credential leakage**: stored secrets never appear in any client response,
  log line, or error message.
- **Approval invariant**: no path moves an action to `executed` without a logged
  user approval — enforced in the state machine.
- **Injection invariant**: flagged content from any custom source can never be
  approved from a shortcut or rule; it always requires manual review.
- **Kill switch**: disconnect any integration instantly (with a confirm).
  Disabling stops all its proposals and calls immediately and deletes its stored
  credentials.
- **Isolation**: a user's custom integration and its credentials are only ever
  usable by that user (scoped queries + row-level security). User A can never
  act through user B's connection.
- **Pro+ gating**: adding any custom integration requires a pro+ plan; free is
  built-ins only, one connection.

Every custom-integration event — added, removed, proposed, executed, injection
caught, SSRF blocked — is written to the security log and surfaced in the
account → security panel.

---

## Sample mode still works

With nothing connected, the public sandbox and the sample flows keep working —
custom integrations are additive, never required.

## Your responsibility

You're responsible for the custom integrations you add. cosigno still requires
your approval for every action, tiers each one by risk, and treats every
response as untrusted — but it will call the endpoints you map with the key you
provide. Only connect tools you trust with the scope of the key you give them.
