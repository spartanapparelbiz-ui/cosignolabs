import { describe, expect, it } from "vitest";
import { buildTwin, type DigitalTwin } from "@/lib/twin/model";
import {
  canonicalize,
  mapSchema,
  applyMapping,
  permissionFor,
  mapExternalPermission,
  businessActionName,
} from "@/lib/workspace-model/canonical";
import {
  buildGraph,
  neighbors,
  operationNodeId,
  resourceNodeId,
  traverse,
  WORKSPACE_ROOT,
} from "@/lib/workspace-model/graph";
import { analyzeDependencies, analyzeOperationImpact } from "@/lib/workspace-model/dependencies";
import { parseQuery, runQuery } from "@/lib/workspace-model/query";
import { buildChangeset } from "@/lib/workspace-model/changeset";
import { buildPlan } from "@/lib/workspace-model/plan";
import { buildExecutionDiff } from "@/lib/workspace-model/diff";
import { buildRollbackPlan, findInverseOperation } from "@/lib/workspace-model/rollback";
import { buildSyncReport, reconcile, syncModeFor } from "@/lib/workspace-model/sync";

/* ------------------------------------------------------------- fixtures */

const stripe = buildTwin({
  connection_key: "stripe",
  name: "Stripe",
  kind: "app",
  status: "connected",
  source: "provider",
  actions: [
    { id: "list_customers", summary: "List customers", mutates: false },
    { id: "update_customer", summary: "Update a customer", mutates: true },
    { id: "delete_customer", summary: "Delete a customer", mutates: true },
    { id: "create_customer", summary: "Create a customer", mutates: true },
    { id: "list_invoices", summary: "List invoices", mutates: false },
    { id: "create_refund", summary: "Refund a payment", mutates: true },
    { id: "list_subscriptions", summary: "List subscriptions", mutates: false },
  ],
});

const github = buildTwin({
  connection_key: "github",
  name: "GitHub",
  kind: "app",
  status: "connected",
  source: "provider",
  actions: [
    { id: "list_repositories", summary: "List repositories", mutates: false },
    { id: "create_issue", summary: "Open an issue", mutates: true },
    { id: "delete_branch", summary: "Delete a branch", mutates: true },
    { id: "list_branches", summary: "List branches", mutates: false },
  ],
});

const salesforce = buildTwin({
  connection_key: "salesforce",
  name: "Salesforce",
  kind: "app",
  status: "connected",
  source: "provider",
  actions: [
    { id: "list_customers", summary: "List customers", mutates: false },
    { id: "update_customer", summary: "Update a customer", mutates: true },
  ],
});

const TWINS: DigitalTwin[] = [stripe, github, salesforce];
const graph = buildGraph(TWINS, "2026-01-01T00:00:00.000Z");

/* ------------------------------------------------------------ canonical */

describe("canonical mapping", () => {
  it("normalizes vendor dialects onto one object vocabulary", () => {
    expect(canonicalize("cust").type).toBe("customer");
    expect(canonicalize("acct_id").domain).toBe("crm");
    expect(canonicalize("pull_request").type).toBe("pull_request");
    expect(canonicalize("invoice_total").type).toBe("invoice");
  });

  it("keeps an unrecognized resource generic instead of forcing a domain", () => {
    const odd = canonicalize("widget_frobnicator");
    expect(odd.domain).toBe("generic");
    expect(odd.type).toBe("widget_frobnicator");
  });

  it("maps external field names and reports what it could not map", () => {
    const mapping = mapSchema(["cust_name", "acct_id", "invoice_total", "zorp_field"]);
    expect(mapping.mappings.find((m) => m.external === "cust_name")?.canonical).toBe("name");
    expect(mapping.mappings.find((m) => m.external === "acct_id")?.canonical).toBe("account_id");
    expect(mapping.mappings.find((m) => m.external === "invoice_total")?.canonical).toBe("amount_cents");
    // Unmapped is surfaced, never silently dropped.
    expect(mapping.unmapped).toEqual(["zorp_field"]);
  });

  it("projects a record through its mapping", () => {
    const mapping = mapSchema(["cust_name", "zorp_field"]);
    expect(applyMapping({ cust_name: "Ada", zorp_field: 1 }, mapping)).toEqual({ name: "Ada" });
  });

  it("gives money operations the permission names the product already uses", () => {
    expect(permissionFor(canonicalize("refund"), "create")).toBe("Finance.Refund");
    expect(permissionFor(canonicalize("repository"), "update")).toBe("Repository.Repository.Write");
    expect(permissionFor(canonicalize("account"), "read")).toBe("CRM.Account.Read");
  });

  it("translates external permission vocabularies into one model", () => {
    expect(mapExternalPermission("github", "Repository Admin").cosigno).toBe("Repository.Write");
    expect(mapExternalPermission("salesforce", "Modify Accounts").cosigno).toBe("CRM.Account.Write");
    expect(mapExternalPermission("stripe", "Refunds").cosigno).toBe("Finance.Refund");
    const unknown = mapExternalPermission("acme", "frobnicate");
    expect(unknown.recognized).toBe(false);
    expect(unknown.cosigno).toBe("Connector.Acme.Frobnicate");
  });

  it("names actions in business language, not API language", () => {
    expect(businessActionName("create_refund", canonicalize("refund"), "create")).toBe("Refund customer");
    expect(businessActionName("list_customers", canonicalize("customer"), "read")).toBe("List customer");
  });
});

/* ---------------------------------------------------------------- graph */

describe("universal object graph", () => {
  it("projects every connector, resource, operation and permission", () => {
    expect(graph.stats.connectors).toBe(3);
    expect(graph.nodes.find((n) => n.id === WORKSPACE_ROOT)).toBeTruthy();
    expect(graph.stats.operations).toBe(
      stripe.operation_count + github.operation_count + salesforce.operation_count
    );
    expect(graph.stats.permissions).toBeGreaterThan(0);
  });

  it("is deterministic — the same twins always build the same graph", () => {
    const again = buildGraph(TWINS, "2026-01-01T00:00:00.000Z");
    expect(JSON.stringify(again)).toEqual(JSON.stringify(graph));
  });

  it("reports un-synced instance counts as null, never as zero", () => {
    const customers = graph.nodes.find((n) => n.id === resourceNodeId("stripe", "customer"));
    expect(customers?.synced_count).toBeNull();
    expect(graph.stats.synced_instances).toBeNull();
  });

  it("counts synced instances only where a connector actually observed them", () => {
    const synced = buildGraph([
      buildTwin({
        connection_key: "stripe",
        name: "Stripe",
        kind: "app",
        status: "connected",
        source: "provider",
        actions: [{ id: "list_customers", summary: "List customers", mutates: false }],
        syncedCounts: { customer: 42 },
      }),
    ]);
    expect(synced.stats.synced_instances).toBe(42);
    expect(synced.stats.synced_resources).toBe(1);
  });

  it("links the same canonical object across different systems", () => {
    const sameAs = graph.edges.filter((e) => e.kind === "same_as");
    expect(
      sameAs.some(
        (e) =>
          e.from === resourceNodeId("stripe", "customer") &&
          e.to === resourceNodeId("salesforce", "customer")
      )
    ).toBe(true);
  });

  it("draws intra-connector references only when both objects exist", () => {
    const invoiceRefs = graph.edges.filter(
      (e) => e.kind === "references" && e.from === resourceNodeId("stripe", "invoice")
    );
    expect(invoiceRefs.some((e) => e.to === resourceNodeId("stripe", "customer"))).toBe(true);
    // GitHub exposes no customer, so no reference edge is invented for it.
    expect(
      graph.edges.some((e) => e.kind === "references" && e.to === resourceNodeId("github", "customer"))
    ).toBe(false);
  });

  it("attaches the permission each operation requires", () => {
    const refundOp = operationNodeId("stripe", "create_refund");
    const requires = neighbors(graph, refundOp).filter((n) => n.edge.kind === "requires");
    expect(requires.map((r) => r.node.label)).toContain("Finance.Refund");
  });

  it("traverses bounded by depth and edge kind", () => {
    const reached = traverse(graph, WORKSPACE_ROOT, { depth: 1, kinds: ["contains"] });
    expect(reached.filter((r) => r.depth === 1).every((r) => r.node.kind === "connector")).toBe(true);
  });
});

/* --------------------------------------------------------- dependencies */

describe("dependency engine", () => {
  const report = analyzeDependencies(graph, resourceNodeId("stripe", "customer"), { action: "delete" });

  it("finds objects that reference the target inside the connector", () => {
    expect(report.affected.some((a) => a.node_id === resourceNodeId("stripe", "invoice"))).toBe(true);
  });

  it("crosses system boundaries through canonical identity", () => {
    expect(report.systems).toContain("salesforce");
  });

  it("names the operations that would break", () => {
    expect(report.broken_operations.length).toBeGreaterThan(0);
  });

  it("never invents record counts it has not observed", () => {
    expect(report.has_observed_counts).toBe(false);
    for (const a of report.affected) expect(a.synced_count).toBeNull();
    expect(report.caveats.join(" ")).toMatch(/will not estimate a number it hasn't observed/i);
  });

  it("escalates severity with reach, and treats reads as harmless", () => {
    expect(["high", "severe"]).toContain(report.severity);
    const read = analyzeDependencies(graph, resourceNodeId("stripe", "customer"), { action: "read" });
    expect(read.severity).toBe("none");
  });

  it("refuses to reason about an object that is not in the model", () => {
    const missing = analyzeDependencies(graph, "resource:acme:ghost");
    expect(missing.severity).toBe("none");
    expect(missing.summary).toMatch(/not in the Workspace Model/);
  });

  it("resolves an operation to the resource it acts on", () => {
    const op = analyzeOperationImpact(graph, operationNodeId("stripe", "delete_customer"));
    expect(op.origin.node_id).toBe(resourceNodeId("stripe", "customer"));
  });
});

/* ---------------------------------------------------------------- query */

describe("natural-language query", () => {
  it("is deterministic — the same question always parses the same way", () => {
    const a = parseQuery("show every destructive action in stripe", graph);
    const b = parseQuery("show every destructive action in stripe", graph);
    expect(a).toEqual(b);
  });

  it("reads risk, connector and object out of a sentence", () => {
    const parsed = parseQuery("which actions can delete customers in stripe", graph);
    expect(parsed.filters.risk).toContain("destructive");
    expect(parsed.filters.connectors).toContain("stripe");
    expect(parsed.filters.canonical).toContain("customer");
  });

  it("answers a capability question with operations only", () => {
    const result = runQuery(graph, "which actions can delete data");
    expect(result.nodes.length).toBeGreaterThan(0);
    expect(result.nodes.every((n) => n.kind === "operation")).toBe(true);
  });

  it("scopes results to a named system", () => {
    const result = runQuery(graph, "show every action in github");
    expect(result.nodes.every((n) => n.connector === "github" || n.kind === "permission")).toBe(true);
  });

  it("answers an impact question with a dependency report", () => {
    const result = runQuery(graph, "what would be affected if invoices are deleted");
    expect(result.impact).toBeTruthy();
    expect(result.impact?.origin.node_id).toBe(resourceNodeId("stripe", "invoice"));
  });

  it("finds irreversible actions", () => {
    const result = runQuery(graph, "find irreversible actions");
    expect(result.nodes.length).toBeGreaterThan(0);
    expect(result.nodes.every((n) => n.reversible === false)).toBe(true);
  });

  it("surfaces words it could not use instead of ignoring them", () => {
    const result = runQuery(graph, "show quokka objects");
    expect(result.interpretation.unmatched).toContain("quokka");
  });

  it("says so plainly when nothing matches", () => {
    const result = runQuery(graph, "show every action in mainframe");
    expect(result.answer.length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------ changeset */

describe("changeset preview", () => {
  const changeset = buildChangeset({
    twin: stripe,
    graph,
    operation: "update_customer",
    before: { name: "Ada", email: "ada@example.com" },
    after: { name: "Ada Lovelace", email: "ada@example.com" },
  });

  it("lists exactly the fields that change", () => {
    expect(changeset.entries).toHaveLength(1);
    expect(changeset.entries[0]).toMatchObject({ kind: "modified", field: "name" });
    expect(changeset.modified).toBe(1);
  });

  it("is stable — the same proposed change yields the same id", () => {
    const again = buildChangeset({
      twin: stripe,
      graph,
      operation: "update_customer",
      before: { name: "Ada", email: "ada@example.com" },
      after: { name: "Ada Lovelace", email: "ada@example.com" },
    });
    expect(again.id).toBe(changeset.id);
  });

  it("states required permissions and affected systems", () => {
    expect(changeset.required_permissions).toContain("CRM.Customer.Write");
    expect(changeset.affected_systems).toContain("stripe");
    expect(changeset.affected_systems).toContain("salesforce");
  });

  it("reports no cost rather than guessing one", () => {
    expect(changeset.cost.amount_cents).toBeNull();
    expect(changeset.cost.basis).toMatch(/rather than guessing/);
  });

  it("refuses an operation the model does not declare", () => {
    const refused = buildChangeset({ twin: stripe, graph, operation: "drop_database" });
    expect(refused.refused).toBe(true);
    expect(refused.requires).toBe("deny");
    expect(refused.refusal_reason).toMatch(/not an operation this connection exposes/);
  });

  it("refuses a connector that has no model at all", () => {
    const refused = buildChangeset({ twin: undefined, graph, operation: "anything" });
    expect(refused.refused).toBe(true);
    expect(refused.summary).toMatch(/will not call a system it has not modelled/);
  });

  it("never lowers authority below the twin's pinned floor", () => {
    const refund = buildChangeset({
      twin: stripe,
      graph,
      operation: "create_refund",
      after: { amount_cents: 1994 },
    });
    expect(refund.requires).toBe("sign");
    expect(refund.required_permissions).toContain("Finance.Refund");
    expect(refund.cost.amount_cents).toBe(1994);
  });

  it("raises authority when the blast radius demands it, even for an update", () => {
    const big = buildChangeset({
      twin: stripe,
      graph,
      operation: "update_customer",
      before: { name: "a" },
      after: { name: "b" },
      records_affected: 5000,
      pii: true,
    });
    expect(["approve", "sign"]).toContain(big.requires);
    expect(big.risk.level).toBe("severe");
  });
});

/* ----------------------------------------------------------- rollback */

describe("rollback engine", () => {
  it("undoes a create with the connector's own delete", () => {
    const plan = buildRollbackPlan({
      twin: stripe,
      connector: "stripe",
      resource: "customer",
      mutation: "create",
      changes: [{ field: "name", before: null, after: "Ada" }],
    });
    expect(plan.supported).toBe("full");
    expect(plan.steps[0].operation).toBe("delete_customer");
    expect(plan.requires).toBe("approve");
  });

  it("restores an update from the captured before values", () => {
    const plan = buildRollbackPlan({
      twin: stripe,
      connector: "stripe",
      resource: "customer",
      mutation: "update",
      changes: [{ field: "name", before: "Ada", after: "Ada Lovelace" }],
    });
    expect(plan.supported).toBe("full");
    expect(plan.steps[0].detail).toContain('name → "Ada"');
  });

  it("marks a change irreversible when the connector exposes no inverse", () => {
    const plan = buildRollbackPlan({
      twin: github,
      connector: "github",
      resource: "branch",
      mutation: "delete",
      changes: [],
    });
    expect(plan.supported).toBe("none");
    expect(plan.requires).toBe("deny");
    expect(plan.caveats.join(" ")).toMatch(/cannot be undone/);
  });

  it("requires a signature to recreate a deleted record, and says the id will differ", () => {
    const plan = buildRollbackPlan({
      twin: stripe,
      connector: "stripe",
      resource: "customer",
      mutation: "delete",
      changes: [{ field: "name", before: "Ada", after: null }],
    });
    expect(plan.supported).toBe("partial");
    expect(plan.requires).toBe("sign");
    expect(plan.caveats.join(" ")).toMatch(/is not the original/);
  });

  it("warns that money and downstream side effects are not un-sent", () => {
    const plan = buildRollbackPlan({
      twin: stripe,
      connector: "stripe",
      resource: "customer",
      mutation: "update",
      changes: [{ field: "name", before: "a", after: "b" }],
      amount_cents: 5000,
      affected_systems: ["stripe", "salesforce"],
    });
    expect(plan.caveats.join(" ")).toMatch(/second, separate transaction/);
    expect(plan.caveats.join(" ")).toMatch(/already left and cannot be recalled/);
  });

  it("has nothing to undo for a read", () => {
    const plan = buildRollbackPlan({
      twin: stripe,
      connector: "stripe",
      resource: "customer",
      mutation: "read",
      changes: [],
    });
    expect(plan.supported).toBe("full");
    expect(plan.steps).toHaveLength(0);
  });

  it("finds an inverse operation only when the twin declares one", () => {
    expect(findInverseOperation(stripe, "customer", "delete")).toBe("delete_customer");
    expect(findInverseOperation(github, "branch", "create")).toBeNull();
  });
});

/* --------------------------------------------------------------- plan */

describe("planning engine", () => {
  const plan = buildPlan(
    {
      goal: "Refund the duplicate payment",
      connector: "stripe",
      operation: "create_refund",
      after: { amount_cents: 1994, reason: "duplicate charge" },
    },
    TWINS,
    graph,
    "2026-01-01T00:00:00.000Z"
  );

  it("plans in order: locate, verify, policy, simulate, estimate, approve, execute, confirm", () => {
    expect(plan.steps.map((s) => s.kind)).toEqual([
      "locate",
      "verify",
      "policy",
      "simulate",
      "estimate",
      "approve",
      "execute",
      "confirm",
    ]);
  });

  it("only the execute step touches production", () => {
    expect(plan.steps.filter((s) => s.mutates).map((s) => s.kind)).toEqual(["execute"]);
  });

  it("carries the changeset and the authority it demands", () => {
    expect(plan.requires).toBe("sign");
    expect(plan.changeset.operation).toBe("create_refund");
  });

  it("blocks the plan when the model does not declare the operation", () => {
    const bogus = buildPlan(
      { goal: "do the thing", connector: "stripe", operation: "wire_money_somewhere" },
      TWINS,
      graph
    );
    expect(bogus.executable).toBe(false);
    expect(bogus.steps.find((s) => s.kind === "verify")?.status).toBe("blocked");
    expect(bogus.steps.find((s) => s.kind === "execute")?.status).toBe("blocked");
  });

  it("blocks execution against a connector that is not connected", () => {
    const offline = buildTwin({
      connection_key: "notion",
      name: "Notion",
      kind: "app",
      status: "not_connected",
      source: "provider",
      actions: [{ id: "create_page", summary: "Create a page", mutates: true }],
    });
    const p = buildPlan(
      { goal: "write it up", connector: "notion", operation: "create_page" },
      [...TWINS, offline],
      buildGraph([...TWINS, offline])
    );
    expect(p.steps.find((s) => s.kind === "execute")?.status).toBe("blocked");
    expect(p.executable).toBe(false);
  });

  it("says plainly when a change cannot be rolled back", () => {
    const p = buildPlan(
      { goal: "clean up", connector: "github", operation: "delete_branch" },
      TWINS,
      graph
    );
    expect(p.refusals.join(" ")).toMatch(/cannot be rolled back/);
  });

  it("is deterministic — same request, same plan", () => {
    const again = buildPlan(
      {
        goal: "Refund the duplicate payment",
        connector: "stripe",
        operation: "create_refund",
        after: { amount_cents: 1994, reason: "duplicate charge" },
      },
      TWINS,
      graph,
      "2026-01-01T00:00:00.000Z"
    );
    expect(JSON.stringify(again)).toEqual(JSON.stringify(plan));
  });
});

/* --------------------------------------------------------------- diff */

describe("execution diff", () => {
  const changeset = buildChangeset({
    twin: stripe,
    graph,
    operation: "update_customer",
    before: { amount_cents: 411_200, name: "Ada" },
    after: { amount_cents: 211_800, name: "Ada" },
  });

  it("shows before → after with a signed delta, in money where it is money", () => {
    const diff = buildExecutionDiff(changeset);
    const row = diff.rows.find((r) => r.label === "Balance")!;
    expect(row.before).toBe("$4,112.00");
    expect(row.after).toBe("$2,118.00");
    expect(row.delta).toBe("−$1,994.00");
  });

  it("labels a diff as planned until an execution is observed", () => {
    expect(buildExecutionDiff(changeset).summary).toMatch(/PLANNED figures/);
  });

  it("claims nothing about secrets when nothing was reported", () => {
    expect(buildExecutionDiff(changeset).counters.secrets_changed).toBeNull();
  });

  it("flags fields the execution changed that the plan never predicted", () => {
    const diff = buildExecutionDiff(changeset, {
      before: { amount_cents: 411_200, tier: "standard" },
      after: { amount_cents: 211_800, tier: "enterprise" },
    });
    expect(diff.matches_plan).toBe(false);
    expect(diff.unexpected.map((u) => u.label)).toContain("Tier");
    expect(diff.summary).toMatch(/did not predict/);
  });

  it("confirms a clean match against the approved changeset", () => {
    const diff = buildExecutionDiff(changeset, {
      before: { amount_cents: 411_200 },
      after: { amount_cents: 211_800 },
    });
    expect(diff.matches_plan).toBe(true);
    expect(diff.summary).toMatch(/matches changeset/);
  });
});

/* --------------------------------------------------------------- sync */

describe("live synchronization", () => {
  it("uses a push mode where the provider pushes, and polls otherwise", () => {
    expect(syncModeFor(github).mode).toBe("webhook");
    expect(syncModeFor(salesforce).mode).toBe("poll");
    const mcp = buildTwin({
      connection_key: "acme-mcp",
      name: "Acme MCP",
      kind: "mcp",
      status: "connected",
      source: "mcp",
      actions: [{ id: "list_things", summary: "List things", mutates: false }],
    });
    expect(syncModeFor(mcp).mode).toBe("poll");
  });

  it("marks a connector stale past its freshness budget", () => {
    const now = Date.parse("2026-01-01T12:00:00.000Z");
    const report = buildSyncReport(
      [
        { twin: github, last_synced_at: "2026-01-01T11:55:00.000Z" },
        { twin: salesforce, last_synced_at: "2026-01-01T02:00:00.000Z" },
      ],
      now
    );
    expect(report.connectors.find((c) => c.connector === "github")?.stale).toBe(false);
    expect(report.connectors.find((c) => c.connector === "salesforce")?.stale).toBe(true);
    expect(report.summary).toMatch(/stale/);
  });

  it("treats a connected-but-never-observed system as stale, not as fresh", () => {
    const report = buildSyncReport([{ twin: github, last_synced_at: null }], Date.parse("2026-01-01T12:00:00.000Z"));
    expect(report.connectors[0].stale).toBe(true);
    expect(report.never_synced).toBe(1);
  });

  it("resolves conflicts in favour of production, and flags what it could not verify", () => {
    const { merged, conflicts } = reconcile(
      { name: "Ada", tier: "standard", local_only: true },
      { name: "Ada Lovelace", tier: "standard" }
    );
    expect(merged.name).toBe("Ada Lovelace");
    expect(conflicts.find((c) => c.field === "name")?.resolution).toBe("remote");
    expect(conflicts.find((c) => c.field === "local_only")?.resolution).toBe("unresolved");
  });
});
