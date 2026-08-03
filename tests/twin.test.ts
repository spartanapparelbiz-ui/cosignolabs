import { describe, expect, it } from "vitest";
import {
  buildTwin,
  previewChange,
  splitActionId,
  mutationOf,
  categoryFor,
} from "@/lib/twin/model";

const ACTIONS = [
  { id: "list_repositories", summary: "List repositories", mutates: false },
  { id: "create_issue", summary: "Open an issue", mutates: true },
  { id: "update_issue", summary: "Edit an issue", mutates: true },
  { id: "delete_branch", summary: "Delete a branch", mutates: true },
  { id: "create_refund", summary: "Refund a payment", mutates: true },
];

const twin = buildTwin({
  connection_key: "github",
  name: "GitHub",
  kind: "app",
  status: "connected",
  source: "provider",
  actions: ACTIONS,
});

describe("twin derivation", () => {
  it("splits verb from resource and groups operations by resource", () => {
    expect(splitActionId("create_issue")).toEqual({ verb: "create", resource: "issue" });
    expect(splitActionId("list_pull_requests")).toEqual({ verb: "list", resource: "pull_requests" });
    const names = twin.resources.map((r) => r.name).sort();
    expect(names).toEqual(["branch", "issue", "refund", "repository"]);
  });

  it("classifies mutations and reversibility honestly", () => {
    expect(mutationOf("list", false)).toBe("read");
    expect(mutationOf("delete", true)).toBe("delete");
    const del = twin.resources.find((r) => r.name === "branch")!.operations[0];
    expect(del.mutation).toBe("delete");
    expect(del.reversible).toBe(false);
  });

  it("maps operations onto the Boundary's categories, keeping pinned floors", () => {
    expect(categoryFor("delete", "branch")).toBe("delete");
    expect(categoryFor("create", "refund")).toBe("refund");
    const refund = twin.resources.find((r) => r.name === "refund")!.operations[0];
    expect(refund.tier).toBe(3); // pinned — never auto
  });

  it("reports un-synced resources as null, never as zero", () => {
    for (const r of twin.resources) expect(r.synced_count).toBeNull();
    expect(twin.schema_only).toBe(true);
  });

  it("marks a twin as data-backed only where counts were actually observed", () => {
    const t = buildTwin({
      connection_key: "github",
      name: "GitHub",
      kind: "app",
      status: "connected",
      source: "provider",
      actions: ACTIONS,
      syncedCounts: { issue: 12 },
    });
    expect(t.resources.find((r) => r.name === "issue")!.synced_count).toBe(12);
    expect(t.resources.find((r) => r.name === "branch")!.synced_count).toBeNull();
    expect(t.schema_only).toBe(false);
  });
});

describe("change preview — the planner cannot invent an endpoint", () => {
  it("REFUSES an operation the twin does not declare", () => {
    const p = previewChange(twin, "force_push_main", {}, {});
    expect(p.unknown_operation).toBe(true);
    expect(p.requires).toBe("deny");
    expect(p.effect).toContain("will not attempt it");
  });

  it("produces a field-level before → after diff for the exact payload", () => {
    const p = previewChange(
      twin,
      "update_issue",
      { title: "Bug", state: "open", assignee: "ada" },
      { title: "Bug in checkout", state: "open", assignee: "ada" }
    );
    expect(p.unknown_operation).toBe(false);
    expect(p.changes).toEqual([{ field: "title", before: "Bug", after: "Bug in checkout" }]);
    expect(p.mutation).toBe("update");
  });

  it("never lowers a pinned floor in the preview", () => {
    const p = previewChange(twin, "create_refund", {}, { amount_cents: 1 });
    expect(p.requires).toBe("sign");
  });

  it("flags irreversible operations in plain language", () => {
    const p = previewChange(twin, "delete_branch", { name: "feat/x" }, {});
    expect(p.reversible).toBe(false);
    expect(p.effect).toContain("cannot be undone");
    expect(p.requires).toBe("sign"); // delete is pinned tier 3
  });

  it("a read changes nothing and says so", () => {
    const p = previewChange(twin, "list_repositories", {}, {});
    expect(p.mutation).toBe("read");
    expect(p.effect).toContain("Nothing changes");
  });
});
