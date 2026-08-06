import { describe, expect, it } from "vitest";
import { config } from "./config.js";
import { proposeRemediation } from "./tools/remediate.js";
import { makeRun } from "./test/fixtures.js";

describe("MODE=local defaults (integration-style)", () => {
  it("runs unit tests under local mode with memory store and no paging/ReAct", () => {
    expect(config.mode).toBe("local");
    expect(config.storeBackend).toBe("memory");
    expect(config.useDurableStore).toBe(false);
    expect(config.reactEnabled).toBe(false);
    expect(config.pagingEnabled).toBe(false);
  });

  it("proposeRemediation uses local-secret without network", () => {
    const prev = process.env.APP_SECRET;
    delete process.env.APP_SECRET;
    try {
      const proposal = proposeRemediation(
        makeRun({
          hypotheses: [
            {
              id: "hyp_1",
              rootCauseLabel: "missing_required_env",
              confidence: 0.9,
              summary: "missing",
              evidenceIds: [],
            },
          ],
        }),
      );
      expect(proposal.actions[0]?.type).toBe("patch_env");
      expect(proposal.actions[0]?.details.APP_SECRET).toBe("local-secret");
    } finally {
      if (prev === undefined) delete process.env.APP_SECRET;
      else process.env.APP_SECRET = prev;
    }
  });
});
