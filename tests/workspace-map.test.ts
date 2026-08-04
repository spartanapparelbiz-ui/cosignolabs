import { describe, expect, it } from "vitest";
import { buildTwin } from "@/lib/twin/model";
import { buildGraph } from "@/lib/workspace-model/graph";
import { buildMap } from "@/lib/workspace-model/map";

/**
 * The map exists because a graph drawn as a graph is a spiderweb. These lock
 * down the two properties that keep it readable: one box per system, and an
 * arrow only where there is a real reason for one.
 */

function twin(key: string, name: string, actions: string[]) {
  return buildTwin({
    connection_key: key,
    provider_key: key,
    name,
    kind: "app",
    status: "connected",
    source: "provider",
    actions: actions.map((id) => ({ id, summary: id, mutates: !id.startsWith("list") })),
  });
}

const github = twin("github", "GitHub", ["list_repositories", "create_issue", "delete_branch"]);
const stripe = twin("stripe", "Stripe", ["list_customers", "create_refund", "list_invoices"]);
const salesforce = twin("salesforce", "Salesforce", ["list_customers", "update_customer"]);
const slack = twin("slack", "Slack", ["send_message", "list_channels"]);

const map = buildMap(buildGraph([slack, stripe, github, salesforce]));

describe("workspace map", () => {
  it("has one box per system — never one per object or action", () => {
    expect(map.systems.map((s) => s.name)).toHaveLength(4);
    expect(new Set(map.systems.map((s) => s.name)).size).toBe(4);
  });

  it("reads left to right in the order work flows, whatever order the twins arrive in", () => {
    // code → finance → customers → messages, regardless of input order.
    expect(map.systems.map((s) => s.name)).toEqual(["GitHub", "Stripe", "Salesforce", "Slack"]);
  });

  it("draws an arrow only between neighbours that share a business object", () => {
    const linked = map.links.map((l) => {
      const from = map.systems.find((s) => s.id === l.from)!.name;
      const to = map.systems.find((s) => s.id === l.to)!.name;
      return `${from}→${to}`;
    });
    // Stripe and Salesforce both hold customers; GitHub and Stripe share nothing.
    expect(linked).toContain("Stripe→Salesforce");
    expect(linked).not.toContain("GitHub→Stripe");
  });

  it("never links every pair — that is the spiderweb this replaces", () => {
    expect(map.links.length).toBeLessThan(map.systems.length);
  });

  it("says why an arrow exists", () => {
    const link = map.links.find((l) => l.shared.includes("customer"));
    expect(link?.label).toMatch(/both hold customer/);
  });

  it("still reports every relationship on the system itself, just not as lines", () => {
    const stripeSystem = map.systems.find((s) => s.name === "Stripe")!;
    expect(stripeSystem.shares_with).toContain("Salesforce");
  });

  it("carries the objects and actions a box opens into", () => {
    const gh = map.systems.find((s) => s.name === "GitHub")!;
    expect(gh.objects.map((o) => o.label)).toContain("Repositories");
    expect(gh.actions.some((a) => a.risk === "destructive")).toBe(true);
    // Un-synced is null, never zero.
    expect(gh.objects.every((o) => o.synced_count === null)).toBe(true);
  });

  it("reports an empty workspace as empty rather than as a blank map", () => {
    expect(buildMap(buildGraph([])).empty).toBe(true);
  });
});
