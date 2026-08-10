import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { approveAction } from "../src/lib/actions/engine";
import { runCommand } from "../src/lib/agent/pipeline";
import { getStore } from "../src/lib/store";
import { MemoryStore } from "../src/lib/store/memory";

/**
 * Signing is OPTIONAL.
 *
 * The signature is Cosigno's flourish, not its lock. Approving must never
 * require drawing on a canvas with a mouse — a nice ceremony the first time
 * and an obstacle every day after. What must survive is the audit trail: the
 * server writes the same hashed authorization record either way, and it says
 * honestly which method was used.
 *
 * The one place a deliberate keystroke still belongs is a tier-3 action:
 * delete, refund, payment. Irreversible. The product promises typed
 * confirmation for those in writing, so the person approving types the word —
 * the client must never fill it in for them.
 */

const USER = "test-user";

function freshStore(): MemoryStore {
  const store = new MemoryStore();
  (globalThis as unknown as { __cosignoStore?: unknown }).__cosignoStore = store;
  return store;
}

beforeEach(() => {
  freshStore();
});

const DIALOG = readFileSync("src/components/sign/SignDialog.tsx", "utf8");
const CARD = readFileSync("src/components/ActionCard.tsx", "utf8");
const FOCUS = readFileSync("src/components/focus/FocusMode.tsx", "utf8");

/** The proposal a "send an email" command produces, whatever its wording. */
async function proposeSendEmail() {
  const { actions } = await runCommand(USER, "send a follow-up email to the two overdue accounts");
  const pending = actions.find((a) => a.status === "proposed" && a.tier === 2);
  expect(pending, "expected a tier-2 proposal to approve").toBeTruthy();
  return pending!;
}

async function authorizationOf(actionId: string) {
  const events = await getStore().listEvents(USER, actionId);
  const approved = events.find((e) => e.type === "approved");
  expect(approved, "an approval must write an `approved` event").toBeTruthy();
  return (approved!.detail as Record<string, unknown>).authorization as {
    method: string;
    signed_name: string | null;
    record_hash: string;
    signature_image?: string;
  };
}

describe("outward-facing work approves without a signature", () => {
  it("a tier-2 send goes through with no signature at all, and executes", async () => {
    const action = await proposeSendEmail();
    const approved = await approveAction(USER, action.id, {});
    expect(approved.status).toBe("executed");
  });

  it("the record says `approved`, not a pretend signature", async () => {
    const action = await proposeSendEmail();
    await approveAction(USER, action.id, {});
    const auth = await authorizationOf(action.id);
    expect(auth.method).toBe("approved");
    expect(auth.signed_name).toBeNull();
    expect(auth.signature_image).toBeUndefined();
    // Unsigned is still sealed: the proof is the hash, not the drawing.
    expect(auth.record_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("signing still works, and is recorded as a signature", async () => {
    const action = await proposeSendEmail();
    await approveAction(USER, action.id, {
      signature: { name: "Nicholas", image: "data:image/png;base64,aGk=" },
    });
    const auth = await authorizationOf(action.id);
    expect(auth.method).toBe("signed");
    expect(auth.signed_name).toBe("Nicholas");
  });
});

describe("irreversible work still asks for the typed word", () => {
  async function proposeDelete() {
    const { actions } = await runCommand(USER, "permanently delete the old duplicate files");
    return actions.find((a) => a.tier === 3 && a.status === "proposed") ?? null;
  }

  it("a signature alone does not unlock a tier-3 action", async () => {
    const action = await proposeDelete();
    if (!action) return; // planner shape varies; the engine suite pins the rule
    await expect(
      approveAction(USER, action.id, { signature: { name: "Nicholas" } })
    ).rejects.toMatchObject({ code: "confirmation_required" });
  });

  it("the right word approves it; a wrong word does not", async () => {
    const action = await proposeDelete();
    if (!action) return;
    await expect(
      approveAction(USER, action.id, { confirmation: "yes" })
    ).rejects.toMatchObject({ code: "confirmation_mismatch" });
    const done = await approveAction(USER, action.id, { confirmation: action.category });
    expect(done.status).toBe("executed");
  });
});

describe("the dialog says signing is optional, and means it", () => {
  it("Approve is never gated on having drawn something", () => {
    // The primary button's only guard is the tier-3 word. If `inked` ever
    // appears in its disabled expression, the pad is a toll gate again.
    const primary = DIALOG.match(/onClick=\{approvePlain\}\s*\n\s*disabled=\{([^}]*)\}/);
    expect(primary, "the Approve button must exist and state its guard").toBeTruthy();
    expect(primary![1]).toBe("!confirmed");
    expect(primary![1]).not.toMatch(/inked/);
  });

  it("it says so in words, next to the button", () => {
    expect(DIALOG).toMatch(/Signing is optional/);
  });

  it("the signature panel starts closed", () => {
    expect(DIALOG).toMatch(/useState\(false\);\s*\n\s*const \[drawInstead/);
    expect(DIALOG).toMatch(/signOpen \? \(|!signOpen \? \(/);
  });

  it("nothing in the flow is labelled as requiring a signature", () => {
    for (const source of [DIALOG, CARD, FOCUS]) {
      expect(source).not.toMatch(/requires signature/i);
      expect(source).not.toMatch(/Awaiting signature/i);
    }
  });
});

describe("the confirmation word comes from the person, never the client", () => {
  it("the card passes through what the dialog collected", () => {
    // The old line read `confirmation: action.tier === 3 ? action.category : …`,
    // which typed the word on the user's behalf and quietly voided the promise.
    expect(CARD).not.toMatch(/confirmation:\s*action\.tier === 3/);
    expect(CARD).toMatch(/confirmation:\s*auth\.confirmation/);
  });

  it("focus mode sends only what it was given", () => {
    expect(FOCUS).not.toMatch(/tier === 3 && signature/);
    expect(FOCUS).toMatch(/auth\.confirmation \? \{ confirmation: auth\.confirmation \}/);
  });

  it("the dialog only claims a confirmation when it actually asked for one", () => {
    expect(DIALOG).toMatch(/confirmation: confirmWord \? action\.category : undefined/);
  });
});

describe("irreversible actions are never bundled", () => {
  it("bundleable() excludes tier 3 and flagged content", () => {
    const fn = FOCUS.match(/function bundleable\(a: ActionRecord\): boolean \{[\s\S]*?\n\}/)?.[0];
    expect(fn, "bundleable() must exist as the single rule").toBeTruthy();
    expect(fn).toMatch(/!a\.injection_flag/);
    expect(fn).toMatch(/a\.tier !== 3/);
  });

  it("the bundle request therefore never carries a confirmation", () => {
    const loop = FOCUS.match(/const authorizeBundle = useCallback\([\s\S]*?\n  \);/)?.[0];
    expect(loop, "authorizeBundle must exist").toBeTruthy();
    // Comments explaining the rule are not the rule — strip them first.
    const code = loop!.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/confirmation/);
  });
});
