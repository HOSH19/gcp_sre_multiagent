import { describe, expect, it } from "vitest";
import {
  executableActionsFromProposal,
  isExecutableActionType,
  mapProposalThroughPolicy,
} from "./policy.js";

describe("isExecutableActionType", () => {
  it("allowlists rollback_traffic and patch_env only", () => {
    expect(isExecutableActionType("rollback_traffic")).toBe(true);
    expect(isExecutableActionType("patch_env")).toBe(true);
    expect(isExecutableActionType("restart_service")).toBe(false);
    expect(isExecutableActionType("")).toBe(false);
  });
});

describe("mapProposalThroughPolicy / normalizeAction", () => {
  it("drops malformed action entries", () => {
    const mapped = mapProposalThroughPolicy({
      actions: [null, "nope", { reason: "missing type" }, { type: "  " }],
    });
    expect(mapped.proposal.actions).toEqual([]);
    expect(mapped.executable).toEqual([]);
  });

  it("accepts type aliases action_type / actionType", () => {
    const mapped = mapProposalThroughPolicy({
      actions: [
        { action_type: "rollback_traffic", reason: "bad rev", details: { target: "good" } },
        { actionType: "patch_env", details: { APP_SECRET: "local-secret" } },
      ],
    });
    expect(mapped.executable.map((a) => a.type)).toEqual(["rollback_traffic", "patch_env"]);
    expect(mapped.executable[0]?.reason).toBe("bad rev");
    expect(mapped.executable[1]?.reason).toBe("proposed by agent");
  });

  it("canonicalizes patch_env metadata shapes into a plain env map", () => {
    const mapped = mapProposalThroughPolicy({
      summary: "Restore env",
      risk: "Low",
      actions: [
        {
          type: "patch_env",
          details: {
            environment_variable: "APP_SECRET",
            environment_value: "local-secret",
          },
        },
      ],
    });
    expect(mapped.executable).toHaveLength(1);
    expect(mapped.executable[0]?.details).toEqual({ APP_SECRET: "local-secret" });
  });

  it("keeps unknown types as propose-only", () => {
    const mapped = mapProposalThroughPolicy({
      actions: [
        { type: "rollback_traffic", details: { target: "good_revision" } },
        { type: "scale_to_zero", reason: "stop blast", details: {} },
      ],
    });
    expect(mapped.executable.map((a) => a.type)).toEqual(["rollback_traffic"]);
    expect(mapped.proposeOnly.map((a) => a.type)).toEqual(["scale_to_zero"]);
    expect(mapped.proposal.actions).toHaveLength(2);
  });

  it("stringifies non-string detail values", () => {
    const mapped = mapProposalThroughPolicy({
      actions: [{ type: "rollback_traffic", details: { percent: 100 } }],
    });
    expect(mapped.executable[0]?.details.percent).toBe("100");
  });
});

describe("executableActionsFromProposal", () => {
  it("returns empty for null proposal", () => {
    expect(executableActionsFromProposal(null)).toEqual([]);
  });

  it("filters to allowlisted types", () => {
    const actions = executableActionsFromProposal({
      summary: "x",
      risk: "y",
      actions: [
        { type: "patch_env", reason: "r", details: { APP_SECRET: "local-secret" } },
        { type: "restart_service", reason: "r", details: {} },
      ],
    });
    expect(actions).toHaveLength(1);
    expect(actions[0]?.type).toBe("patch_env");
  });
});
