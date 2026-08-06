import { describe, expect, it } from "vitest";
import { RUN_CAPS } from "./caps.js";
import { estimateCostUsd } from "./models.js";

describe("RUN_CAPS", () => {
  it("exposes positive soft caps", () => {
    expect(RUN_CAPS.maxSteps).toBeGreaterThan(0);
    expect(RUN_CAPS.maxWallMs).toBeGreaterThan(0);
    expect(RUN_CAPS.maxCostUsd).toBeGreaterThan(0);
    expect(RUN_CAPS.maxToolCalls).toBeGreaterThan(0);
    expect(RUN_CAPS.maxConcurrentRuns).toBeGreaterThan(0);
  });
});

describe("estimateCostUsd", () => {
  it("scales with token counts for flash-lite", () => {
    const cost = estimateCostUsd("gemini-2.5-flash-lite", 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(0.5, 5);
  });

  it("falls back to flash-lite pricing for unknown models", () => {
    expect(estimateCostUsd("unknown-model", 1_000_000, 0)).toBeCloseTo(0.1, 5);
  });
});
