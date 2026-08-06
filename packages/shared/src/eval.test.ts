import { describe, expect, it } from "vitest";
import { matchRootCause } from "./eval.js";
import { canonicalizeRootCause } from "./eval/aliases.js";
import { SCENARIOS } from "./scenarios.js";

describe("matchRootCause", () => {
  it("matches exact expected labels for every scenario", () => {
    for (const scenario of Object.values(SCENARIOS)) {
      expect(matchRootCause(scenario.expectedRootCause, scenario.expectedRootCause)).toBe(true);
    }
  });

  it("returns false for empty inputs", () => {
    expect(matchRootCause("", "missing_required_env")).toBe(false);
    expect(matchRootCause("missing_required_env", "")).toBe(false);
  });

  it("matches via aliases for scenario root causes", () => {
    expect(matchRootCause("missing_env_var", "missing_required_env")).toBe(true);
    expect(matchRootCause("bad_revision_traffic", "unhealthy_revision_receiving_traffic")).toBe(true);
  });

  it("matches free-form labels via fuzzy rules", () => {
    expect(
      matchRootCause("Unhealthy revision is receiving live traffic", "unhealthy_revision_receiving_traffic"),
    ).toBe(true);
    expect(matchRootCause("Missing APP_SECRET env configuration", "missing_required_env")).toBe(true);
  });

  it("does not cross-match unrelated causes", () => {
    expect(matchRootCause("missing_required_env", "unhealthy_revision_receiving_traffic")).toBe(false);
    expect(matchRootCause("unhealthy_revision_receiving_traffic", "missing_required_env")).toBe(false);
  });
});

describe("canonicalizeRootCause", () => {
  it("normalizes punctuation and casing into alias keys", () => {
    expect(canonicalizeRootCause("  Missing Env Var  ")).toBe("missing_required_env");
    expect(canonicalizeRootCause("Bad Revision Traffic")).toBe("unhealthy_revision_receiving_traffic");
  });
});
