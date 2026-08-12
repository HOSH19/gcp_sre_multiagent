import { describe, expect, it } from "vitest";
import { makeRun } from "../test/fixtures.js";
import { isMissingRequiredEnv, predictedRootCause } from "./rootCause.js";

describe("predictedRootCause", () => {
  it("prefers canonicalRootCause over free-form label", () => {
    const run = makeRun({
      hypotheses: [
        {
          id: "hyp_1",
          rootCauseLabel: "Long narrative about missing APP_SECRET",
          canonicalRootCause: "missing_required_env",
          confidence: 0.9,
          summary: "missing",
          evidenceIds: [],
        },
      ],
    });
    expect(predictedRootCause(run)).toBe("missing_required_env");
    expect(isMissingRequiredEnv(run)).toBe(true);
  });
});
