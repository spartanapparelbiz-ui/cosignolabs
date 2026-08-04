import { describe, expect, it } from "vitest";
import { businessAction, sortActions } from "@/lib/actionLibrary";

/**
 * One capability, one name, everywhere. If the connections page, the approval
 * card, and the model can call the same operation three different things, a
 * user can't tell they're the same thing.
 */

describe("business action names", () => {
  it("names operations the way a person would say them", () => {
    expect(businessAction("merge_pull_request").name).toBe("Merge pull request");
    expect(businessAction("list_repositories").name).toBe("View repositories");
    expect(businessAction("create_issue").name).toBe("Create issue");
    expect(businessAction("delete_branch").name).toBe("Delete branch");
    expect(businessAction("invite_user").name).toBe("Invite user");
  });

  it("uses the product's own words for money", () => {
    expect(businessAction("create_refund").name).toBe("Refund customer");
    expect(businessAction("create_payment").name).toBe("Send payment");
    expect(businessAction("create_charge").name).toBe("Charge customer");
  });

  it("keeps a verb that means something instead of flattening it to CRUD", () => {
    // "Merge" and "archive" say something "update" does not.
    expect(businessAction("archive_thread").name).toMatch(/^Archive/);
    expect(businessAction("deploy_release").name).toMatch(/^Deploy/);
  });

  it("reads a list action as plural and a get as singular", () => {
    expect(businessAction("list_customers").name).toBe("View customers");
    expect(businessAction("get_customer").name).toBe("View customer");
    expect(businessAction("list_opportunities").name).toBe("View opportunities");
  });

  it("never leaks an HTTP verb, a path, or a raw id into the name", () => {
    for (const id of ["create_widget", "GET_things", "list_pull_requests", "doTheThing"]) {
      const { name } = businessAction(id);
      expect(name).not.toMatch(/GET|POST|PUT|PATCH|DELETE\b/);
      expect(name).not.toContain("/");
      expect(name).not.toContain("_");
    }
  });

  it("humanizes an id that doesn't follow verb_resource", () => {
    // Bare MCP tool names are common and follow no convention.
    expect(businessAction("summarize").name).toBe("Summarize");
    expect(businessAction("doTheThing").name).toBe("Do the thing");
  });

  it("keeps an unrecognized object in the connector's own words", () => {
    expect(businessAction("create_frobnicator").name).toBe("Create frobnicator");
  });

  it("keeps the connector's summary as detail, but drops it when it just repeats", () => {
    expect(businessAction("create_issue", "Open an issue on a repository").detail).toBe(
      "Open an issue on a repository"
    );
    expect(businessAction("create_issue", "create issue").detail).toBe("");
    expect(businessAction("create_issue").detail).toBe("");
  });

  it("classifies the mutation so the UI can colour it", () => {
    expect(businessAction("list_things").mutation).toBe("read");
    expect(businessAction("create_thing").mutation).toBe("create");
    expect(businessAction("delete_thing").mutation).toBe("delete");
  });
});

describe("ordering a connection's actions", () => {
  it("puts reads first and anything destructive last", () => {
    const sorted = sortActions([
      { id: "delete_widget" },
      { id: "create_widget" },
      { id: "list_widgets" },
      { id: "update_widget" },
    ]);
    expect(sorted.map((a) => a.id)).toEqual([
      "list_widgets",
      "create_widget",
      "update_widget",
      "delete_widget",
    ]);
  });

  it("does not mutate the input", () => {
    const input = [{ id: "delete_a" }, { id: "list_b" }];
    sortActions(input);
    expect(input.map((a) => a.id)).toEqual(["delete_a", "list_b"]);
  });
});
