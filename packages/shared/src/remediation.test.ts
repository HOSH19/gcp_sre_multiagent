import { describe, expect, it, expectTypeOf } from "vitest";
import {
  EXECUTABLE_REMEDIATION_ACTIONS,
  type ExecutableRemediationAction,
  type HypothesisItem,
  type RemediationAction,
} from "./index.js";

describe("EXECUTABLE_REMEDIATION_ACTIONS", () => {
  it("allowlists only rollback_traffic and patch_env", () => {
    expect([...EXECUTABLE_REMEDIATION_ACTIONS].sort()).toEqual(["patch_env", "rollback_traffic"]);
  });

  it("types ExecutableRemediationAction from the allowlist", () => {
    const sample: ExecutableRemediationAction = "patch_env";
    expect(EXECUTABLE_REMEDIATION_ACTIONS).toContain(sample);
  });
});

describe("RemediationAction / HypothesisItem shapes", () => {
  it("keeps details as a plain string map", () => {
    const action: RemediationAction = {
      type: "patch_env",
      reason: "restore",
      details: { APP_SECRET: "local-secret" },
    };
    expect(action.details.APP_SECRET).toBe("local-secret");
  });

  it("allows optional canonicalRootCause on hypotheses", () => {
    const withCanon: HypothesisItem = {
      id: "hyp_1",
      rootCauseLabel: "Missing required env",
      canonicalRootCause: "missing_required_env",
      confidence: 0.9,
      summary: "APP_SECRET gone",
      evidenceIds: [],
    };
    const withoutCanon: HypothesisItem = {
      id: "hyp_2",
      rootCauseLabel: "something else",
      confidence: 0.4,
      summary: "unknown",
      evidenceIds: [],
    };
    expect(withCanon.canonicalRootCause).toBe("missing_required_env");
    expect(withoutCanon.canonicalRootCause).toBeUndefined();
    expectTypeOf(withCanon.canonicalRootCause).toEqualTypeOf<string | undefined>();
  });
});
