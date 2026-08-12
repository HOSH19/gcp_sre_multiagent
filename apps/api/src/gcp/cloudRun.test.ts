import { describe, expect, it } from "vitest";
import { limitRevisionsForEvidence } from "./cloudRun.js";

describe("limitRevisionsForEvidence", () => {
  const revisions = Array.from({ length: 12 }, (_, index) => ({
    name: `patient-000${index + 1}`,
    healthy: index !== 11,
    env: {},
    createTime: `2026-08-12T10:${String(index).padStart(2, "0")}:00Z`,
  }));

  it("keeps traffic-bearing and latest unhealthy revisions within the cap", () => {
    const traffic = { "patient-0003": 100, "patient-00011": 0 };
    const limited = limitRevisionsForEvidence(revisions, traffic, 6);

    expect(limited.length).toBeLessThanOrEqual(6);
    expect(limited.some((revision) => revision.name === "patient-0003")).toBe(true);
    expect(limited.some((revision) => revision.name === "patient-00012")).toBe(true);
    expect(limited.some((revision) => revision.name === "patient-0001")).toBe(false);
  });

  it("returns all revisions when under the cap", () => {
    const small = revisions.slice(0, 3);
    expect(limitRevisionsForEvidence(small, {}, 6)).toEqual(small);
  });
});
