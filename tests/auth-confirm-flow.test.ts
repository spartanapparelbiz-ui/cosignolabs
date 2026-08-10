import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  classifyConfirm,
  failureCopy,
  failureFromProviderCode,
  isOtpType,
  type ConfirmFailure,
} from "../src/lib/supabaseAuth/confirmFlow";
import { confirmDiagnosis } from "../src/lib/supabaseAuth/confirmDiagnosis";

/**
 * Confirming an email must not depend on the dashboard being configured
 * perfectly.
 *
 * The original route accepted exactly one link shape — token_hash + type, the
 * one produced by a CUSTOM email template. Supabase's own default template
 * produces a different shape, so a project that had never touched its
 * templates sent every new user to /sign-in with no error, no confirmed
 * account, and nothing on screen to explain it. The account existed; the
 * person just couldn't get in.
 *
 * These tests pin the decision table for all four shapes Supabase can send,
 * and pin the rule that no path fails silently.
 */

const params = (qs: string) => new URLSearchParams(qs);

describe("classifyConfirm — every shape Supabase can send", () => {
  it("custom template: token_hash + type", () => {
    const flow = classifyConfirm(params("token_hash=pkce_abc&type=signup&next=%2Fapp"));
    expect(flow).toEqual({ kind: "token_hash", tokenHash: "pkce_abc", type: "signup" });
  });

  it("PKCE: a bare code", () => {
    expect(classifyConfirm(params("code=xyz789&next=%2Fapp"))).toEqual({
      kind: "code",
      code: "xyz789",
    });
  });

  it("older template: token + type + email", () => {
    expect(classifyConfirm(params("token=123456&type=signup&email=a%40b.com"))).toEqual({
      kind: "legacy_token",
      token: "123456",
      type: "signup",
      email: "a@b.com",
    });
  });

  it("implicit flow: nothing in the query — the credential is in the fragment", () => {
    // A server never sees "#access_token=…", so this is indistinguishable from
    // an empty link until the browser looks.
    expect(classifyConfirm(params("next=%2Fapp"))).toEqual({ kind: "none" });
  });

  it("a provider error outranks everything else on the URL", () => {
    const flow = classifyConfirm(params("error=access_denied&error_code=otp_expired&token_hash=x&type=signup"));
    expect(flow).toEqual({ kind: "provider_error", code: "otp_expired" });
  });

  it("falls back to `error` when `error_code` is absent", () => {
    expect(classifyConfirm(params("error=access_denied"))).toEqual({
      kind: "provider_error",
      code: "access_denied",
    });
  });

  it("recovery, email_change, magiclink and invite all classify", () => {
    for (const type of ["recovery", "email_change", "magiclink", "invite", "email"]) {
      expect(classifyConfirm(params(`token_hash=t&type=${type}`))).toEqual({
        kind: "token_hash",
        tokenHash: "t",
        type,
      });
    }
  });

  it("a token_hash with a junk type is not treated as a confirmation", () => {
    expect(classifyConfirm(params("token_hash=t&type=../../etc/passwd"))).toEqual({ kind: "none" });
  });

  it("a legacy token without its email cannot be verified, so it is not claimed", () => {
    // verifyOtp needs the address; guessing one would fail confusingly later.
    expect(classifyConfirm(params("token=123456&type=signup"))).toEqual({ kind: "none" });
  });

  it("is stable: classifying twice gives the same answer", () => {
    const qs = "token_hash=abc&type=signup";
    expect(classifyConfirm(params(qs))).toEqual(classifyConfirm(params(qs)));
  });
});

describe("failure reasons are named, never silent", () => {
  it("maps expiry codes to the recoverable 'expired' reason", () => {
    expect(failureFromProviderCode("otp_expired")).toBe("expired");
    expect(failureFromProviderCode("otp_disabled")).toBe("expired");
  });

  it("maps refusal codes to 'access_denied'", () => {
    expect(failureFromProviderCode("access_denied")).toBe("access_denied");
    expect(failureFromProviderCode("unauthorized_client")).toBe("access_denied");
  });

  it("an unrecognised code still produces a reason rather than nothing", () => {
    expect(failureFromProviderCode("something_new_from_supabase")).toBe("verify_failed");
    expect(failureFromProviderCode("")).toBe("verify_failed");
  });

  const REASONS: ConfirmFailure[] = [
    "expired",
    "no_credential",
    "verify_failed",
    "access_denied",
    "not_configured",
  ];

  it("every reason has copy that says something and offers a way out", () => {
    for (const reason of REASONS) {
      const copy = failureCopy(reason);
      expect(copy.title.length).toBeGreaterThan(8);
      expect(copy.body.length).toBeGreaterThan(20);
      // Only the one the user genuinely cannot act on withholds the action.
      expect(copy.canResend).toBe(reason !== "not_configured");
    }
  });

  /**
   * The whole point of this surface: a person is told what happened. Copy that
   * shrugs ("something went wrong") would be the silent bounce with extra
   * steps.
   */
  it("no copy is a generic shrug", () => {
    for (const reason of REASONS) {
      const text = `${failureCopy(reason).title} ${failureCopy(reason).body}`.toLowerCase();
      expect(text).not.toMatch(/something went wrong|unknown error|an error occurred/);
    }
  });
});

/**
 * Configuration vocabulary is for whoever operates the workspace. A customer
 * can't set a dashboard field, so naming one at them only says "you are not
 * the audience" — the same rule tests/no-config-names-reach-users.test.ts
 * holds for API responses, applied here to the auth surface.
 */
describe("operator detail never reaches a customer", () => {
  const SETTING_NAME = /\b[A-Z][A-Z0-9]{2,}(?:_[A-Z0-9]+)+\b/;
  const REASONS: ConfirmFailure[] = [
    "expired",
    "no_credential",
    "verify_failed",
    "access_denied",
    "not_configured",
  ];

  it("user-facing copy names no configuration key", () => {
    for (const reason of REASONS) {
      const copy = failureCopy(reason);
      expect(`${copy.title} ${copy.body}`).not.toMatch(SETTING_NAME);
    }
  });

  it("user-facing copy uses no dashboard or template vocabulary", () => {
    for (const reason of REASONS) {
      const copy = failureCopy(reason);
      const text = `${copy.title} ${copy.body}`.toLowerCase();
      for (const word of ["supabase", "token_hash", "redirect", "site url", "template", "env"]) {
        expect(text, `"${word}" leaked into ${reason} copy`).not.toContain(word);
      }
    }
  });

  it("the diagnoses that DO name configuration live in the server-only module", () => {
    // Belt and braces: if these ever move into confirmFlow.ts they would ride
    // into the client bundle, since that module is imported by client code.
    // Comments are stripped from a production build, so only real code counts
    // — the same scoping tests/no-config-names-reach-users.test.ts uses.
    const client = readFileSync("src/lib/supabaseAuth/confirmFlow.ts", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(client).not.toMatch(/SiteURL|TokenHash|ConfirmationURL/);
    expect(confirmDiagnosis("no_credential")).toMatch(/ConfirmationURL/);
  });

  it("every reason still has an operator diagnosis to log", () => {
    for (const reason of REASONS) {
      expect(confirmDiagnosis(reason).length).toBeGreaterThan(40);
    }
  });
});

/**
 * The route is the contract. These read it as text rather than booting Next,
 * so they stay fast and still fail if someone reintroduces the silent bounce.
 */
describe("the confirm route handles every flow and bounces to none", () => {
  const src = readFileSync("src/app/auth/confirm/route.ts", "utf8");

  it("acts on all four shapes", () => {
    for (const kind of ["token_hash", "legacy_token", "code", "none"]) {
      expect(src).toContain(`case "${kind}"`);
    }
  });

  it("never redirects a failure to /sign-in without saying why", () => {
    // The old behaviour. If it comes back, this fails.
    expect(src).not.toMatch(/redirect\(new URL\("\/sign-in"/);
  });

  it("sends failures to the named-problem surface", () => {
    expect(src).toContain("/auth/problem");
  });

  it("hands the fragment case to the client, which is the only thing that can read it", () => {
    expect(src).toContain("/auth/continue");
  });
});
