import { describe, expect, it } from "vitest";
import { normalizeExecutableActions } from "./approvalNormalize.js";
import { makeRun } from "../test/fixtures.js";

describe("normalizeExecutableActions", () => {
  it("throws when no proposal is present", () => {
    expect(() => normalizeExecutableActions(makeRun())).toThrow(/no remediation proposal/);
  });

  it("skips non-allowlisted actions", () => {
    const run = makeRun({
      hypotheses: [
        {
          id: "hyp_1",
          rootCauseLabel: "missing_required_env",
          canonicalRootCause: "missing_required_env",
          confidence: 0.9,
          summary: "missing secret",
          evidenceIds: [],
        },
      ],
      proposedRemediation: {
        summary: "mix",
        risk: "low",
        actions: [
          { type: "patch_env", reason: "restore", details: { APP_SECRET: "local-secret" } },
          { type: "reboot", reason: "nope", details: {} },
        ],
      },
    });
    const { executable, skipped } = normalizeExecutableActions(run);
    expect(executable.map((a) => a.type)).toEqual(["patch_env"]);
    expect(skipped.map((a) => a.type)).toEqual(["reboot"]);
    expect(executable[0]?.details.APP_SECRET).toBe("local-secret");
  });

  it("keeps allowlisted rollback_traffic details intact", () => {
    const run = makeRun({
      scenario: "bad_revision_traffic",
      hypotheses: [
        {
          id: "hyp_1",
          rootCauseLabel: "unhealthy_revision_receiving_traffic",
          canonicalRootCause: "unhealthy_revision_receiving_traffic",
          confidence: 0.9,
          summary: "bad rev",
          evidenceIds: [],
        },
      ],
      proposedRemediation: {
        summary: "rollback",
        risk: "low",
        actions: [{ type: "rollback_traffic", reason: "safe", details: { target: "good_revision" } }],
      },
    });
    const { executable, skipped } = normalizeExecutableActions(run);
    expect(skipped).toEqual([]);
    expect(executable).toEqual([
      { type: "rollback_traffic", reason: "safe", details: { target: "good_revision" } },
    ]);
  });

  it("returns empty executable when proposal has only propose-only actions", () => {
    const run = makeRun({
      hypotheses: [
        {
          id: "hyp_1",
          rootCauseLabel: "unhealthy_revision_receiving_traffic",
          confidence: 0.9,
          summary: "bad rev",
          evidenceIds: [],
        },
      ],
      proposedRemediation: {
        summary: "only propose-only",
        risk: "low",
        actions: [{ type: "page_oncall", reason: "noise", details: {} }],
      },
    });
    const { executable, skipped } = normalizeExecutableActions(run);
    expect(executable).toEqual([]);
    expect(skipped.map((a) => a.type)).toEqual(["page_oncall"]);
  });

  it("canonicalizes malformed patch_env details from deterministic fallback", () => {
    const run = makeRun({
      hypotheses: [
        {
          id: "hyp_1",
          rootCauseLabel: "missing_required_env",
          confidence: 0.95,
          summary: "missing",
          evidenceIds: [],
        },
      ],
      proposedRemediation: {
        summary: "restore",
        risk: "low",
        actions: [
          {
            type: "patch_env",
            reason: "llm shape",
            details: { environment_variable: "APP_SECRET", environment_value: "wrong-shape" },
          },
        ],
      },
    });
    const { executable } = normalizeExecutableActions(run);
    expect(executable).toHaveLength(1);
    expect(executable[0]?.details).toHaveProperty("APP_SECRET");
    expect(executable[0]?.details).not.toHaveProperty("environment_variable");
  });
});
