import { describe, expect, it } from "vitest";
import { SCENARIOS, type ScenarioId } from "./scenarios.js";

describe("SCENARIOS", () => {
  const ids = Object.keys(SCENARIOS) as ScenarioId[];

  it("defines at least two chaos scenarios with expected root causes", () => {
    expect(ids.length).toBeGreaterThanOrEqual(2);
    for (const id of ids) {
      const s = SCENARIOS[id];
      expect(s.id).toBe(id);
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.expectedRootCause.length).toBeGreaterThan(0);
      expect(s.description.length).toBeGreaterThan(0);
    }
  });

  it("uses unique expectedRootCause labels", () => {
    const causes = ids.map((id) => SCENARIOS[id].expectedRootCause);
    expect(new Set(causes).size).toBe(causes.length);
  });

  it("keeps known scenario ids when still present", () => {
    const known: Partial<Record<string, string>> = {
      missing_config: "missing_required_env",
      bad_revision_traffic: "unhealthy_revision_receiving_traffic",
    };
    for (const [id, expected] of Object.entries(known)) {
      if (id in SCENARIOS) {
        expect(SCENARIOS[id as ScenarioId].expectedRootCause).toBe(expected);
      }
    }
  });
});
