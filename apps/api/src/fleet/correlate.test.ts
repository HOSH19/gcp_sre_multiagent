import { describe, expect, it } from "vitest";
import type { InvestigationRun } from "@gcp-sre/shared";
import { isActiveInvestigationRun } from "./correlate.js";

function run(partial: Partial<InvestigationRun> & Pick<InvestigationRun, "id" | "status">): InvestigationRun {
  return {
    id: partial.id,
    status: partial.status,
    createdAt: partial.createdAt ?? "2026-08-01T00:00:00.000Z",
    updatedAt: partial.updatedAt ?? "2026-08-01T00:00:00.000Z",
    trigger: "manual",
    patientService: "patient",
    targetService: "patient",
    events: [],
    evidence: [],
    hypotheses: [],
    ruledOut: [],
    proposedRemediation: null,
    report: null,
    stepCount: 0,
    toolCallCount: 0,
    costUsd: 0,
    tokensIn: 0,
    tokensOut: 0,
    error: partial.error ?? null,
    leaseExpiresAt: partial.leaseExpiresAt,
  };
}

describe("isActiveInvestigationRun", () => {
  const now = Date.parse("2026-08-12T04:00:00.000Z");
  const leased = new Set(["run_live"]);

  it("treats leased busy runs as active", () => {
    const r = run({ id: "run_live", status: "running", updatedAt: "2026-08-12T03:00:00.000Z" });
    expect(isActiveInvestigationRun(r, leased, now)).toBe(true);
  });

  it("ignores orphaned running rows after lease TTL", () => {
    const r = run({
      id: "run_orphan",
      status: "running",
      updatedAt: "2026-08-06T01:49:23.366Z",
      leaseExpiresAt: "2026-08-06T02:04:20.470Z",
    });
    expect(isActiveInvestigationRun(r, new Set(), now)).toBe(false);
  });

  it("ignores stale queued runs without a lease", () => {
    const r = run({
      id: "run_old_queue",
      status: "queued",
      createdAt: "2026-08-05T08:41:50.499Z",
    });
    expect(isActiveInvestigationRun(r, new Set(), now)).toBe(false);
  });
});
