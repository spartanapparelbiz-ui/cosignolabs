import { describe, expect, it } from "vitest";
import {
  humanizeActionId,
  humanizeEndpoint,
  resourceFromPath,
} from "../src/lib/integrations/engine/humanize";

/**
 * These labels are what a person reads immediately before approving something,
 * so two properties matter more than elegance:
 *
 *  · Deterministic. The same endpoint always renders the same words, every
 *    time, with no model in the loop — a label that drifts can't be reviewed.
 *  · Never softer than the operation. A generated "Update Order" in front of a
 *    DELETE gets things approved that shouldn't be.
 */

describe("endpoints become business language", () => {
  it.each([
    ["POST", "/v1/orders", "Create Order"],
    ["PATCH", "/users/{id}", "Update User"],
    ["DELETE", "/files/{id}", "Delete File"],
    ["PUT", "/v2/products/{id}", "Replace Product"],
    ["GET", "/customers", "List Customers"],
  ])("%s %s → %s", (method, path, expected) => {
    expect(humanizeEndpoint(method, path)).toBe(expected);
  });

  it("treats a trailing action segment as the action itself", () => {
    // /customer/{id}/refund is a refund, not a "Create Refund".
    expect(humanizeEndpoint("POST", "/v2/customer/9482/refund")).toBe("Refund");
  });

  it("skips version prefixes, path parameters, and numeric ids", () => {
    expect(resourceFromPath("/v1/customer/9482/refund")).toBe("refund");
    expect(resourceFromPath("/repos/{owner}/{repo}/issues")).toBe("issues");
    expect(resourceFromPath("/api/:version/tickets")).toBe("tickets");
  });
});

describe("the verb comes from the method, which is what the server will do", () => {
  it("never labels a DELETE as anything softer", () => {
    for (const path of ["/orders/{id}", "/v1/customers/{id}", "/files/temp"]) {
      expect(humanizeEndpoint("DELETE", path).startsWith("Delete")).toBe(true);
    }
  });

  it("a friendly path name cannot talk a DELETE into sounding safe", () => {
    // The path says "archive"; the method says DELETE. The method wins.
    expect(humanizeEndpoint("DELETE", "/mail/archive")).toMatch(/^Delete/);
  });
});

describe("action ids become business language", () => {
  it.each([
    ["create_issue", "Create Issue"],
    ["list_repos", "List Repositories"],
    ["delete_file", "Delete File"],
    ["send_message", "Send Message"],
    ["search_messages", "Search Messages"],
    ["update_record", "Update Record"],
    ["merge_pull_request", "Merge Pull Request"],
  ])("%s → %s", (id, expected) => {
    expect(humanizeActionId(id)).toBe(expected);
  });

  it("expands abbreviations people don't say out loud", () => {
    expect(humanizeActionId("list_orgs")).toBe("List Organizations");
    expect(humanizeActionId("get_db")).toBe("View Database");
  });

  it("handles camelCase and kebab-case the same as snake_case", () => {
    expect(humanizeActionId("createIssue")).toBe("Create Issue");
    expect(humanizeActionId("delete-file")).toBe("Delete File");
  });

  it("puts destructive stems first, so a compound id can't read as harmless", () => {
    // Contains "draft" and "message" too — must still be a deletion.
    expect(humanizeActionId("delete_draft_message")).toMatch(/^Delete/);
    expect(humanizeActionId("remove_archived_orders")).toMatch(/^Delete/);
  });

  it("title-cases rather than inventing a verb it cannot see", () => {
    expect(humanizeActionId("whoami")).toBe("Whoami");
    expect(humanizeActionId("sync_status")).toBe("Sync Status");
  });
});

describe("determinism", () => {
  it("returns identical output across repeated calls", () => {
    const inputs = ["create_issue", "delete_draft_message", "list_repos"];
    for (const i of inputs) {
      expect(humanizeActionId(i)).toBe(humanizeActionId(i));
    }
    expect(humanizeEndpoint("POST", "/v1/orders")).toBe(humanizeEndpoint("POST", "/v1/orders"));
  });

  it("never returns an empty label", () => {
    for (const i of ["", "_", "___", "a"]) {
      expect(humanizeActionId(i).length).toBeGreaterThan(0);
    }
    expect(humanizeEndpoint("GET", "/").length).toBeGreaterThan(0);
  });
});
