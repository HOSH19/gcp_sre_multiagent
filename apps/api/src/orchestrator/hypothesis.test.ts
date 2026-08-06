import { describe, expect, it } from "vitest";
import { inferHypotheses } from "./hypothesis.js";
import { makeRun } from "../test/fixtures.js";
import { SCENARIOS } from "@gcp-sre/shared";

const CANONICAL_LABELS = [...new Set(Object.values(SCENARIOS).map((s) => s.expectedRootCause))];

describe("inferHypotheses", () => {
  it("ranks missing_required_env from health / env evidence", () => {
    const run = makeRun({
      evidence: [
        {
          id: "ev_health",
          source: "getServiceHealth",
          summary: "unhealthy",
          at: "2024-01-01T00:00:00.000Z",
          raw: { patient: { ok: false, reason: "missing_required_env" } },
        },
        {
          id: "ev_env",
          source: "getServiceEnv",
          summary: "no secret",
          at: "2024-01-01T00:00:00.000Z",
          raw: { hasAppSecret: false },
        },
      ],
    });
    const { hypotheses, ruledOut } = inferHypotheses(run);
    expect(hypotheses[0]?.rootCauseLabel).toBe("missing_required_env");
    expect(hypotheses[0]?.canonicalRootCause).toBe("missing_required_env");
    expect(ruledOut).toContain("unhealthy_revision_receiving_traffic");
    expect(ruledOut).not.toContain("missing_required_env");
  });

  it("ranks unhealthy revision when bad traffic is serving", () => {
    const run = makeRun({
      evidence: [
        {
          id: "ev_health",
          source: "getServiceHealth",
          summary: "bad rev",
          at: "2024-01-01T00:00:00.000Z",
          raw: {
            patient: { ok: false, reason: "unhealthy_revision" },
            chaosState: { badRevision: "patient-bad", traffic: { "patient-bad": 100 } },
          },
        },
        {
          id: "ev_traffic",
          source: "getRevisionTraffic",
          summary: "100% bad",
          at: "2024-01-01T00:00:00.000Z",
          raw: { traffic: { "patient-bad": 100, "patient-good": 0 } },
        },
      ],
    });
    const { hypotheses } = inferHypotheses(run);
    expect(hypotheses[0]?.rootCauseLabel).toBe("unhealthy_revision_receiving_traffic");
  });

  it("falls back to unknown when evidence is empty", () => {
    const { hypotheses, ruledOut } = inferHypotheses(makeRun());
    expect(hypotheses).toHaveLength(1);
    expect(hypotheses[0]?.rootCauseLabel).toBe("unknown");
    expect(ruledOut.length).toBe(CANONICAL_LABELS.length);
    for (const label of CANONICAL_LABELS) {
      expect(ruledOut).toContain(label);
    }
  });

  it("uses activeScenario hints when patient reason is absent", () => {
    const run = makeRun({
      evidence: [
        {
          id: "ev_health",
          source: "getServiceHealth",
          summary: "overlay",
          at: "2024-01-01T00:00:00.000Z",
          raw: { patient: { ok: false }, chaosState: { activeScenario: "missing_config" } },
        },
      ],
    });
    const { hypotheses } = inferHypotheses(run);
    expect(hypotheses.some((h) => h.rootCauseLabel === "missing_required_env")).toBe(true);
  });
});
