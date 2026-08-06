import type { InvestigationRun } from "@gcp-sre/shared";

/** Minimal investigation run for unit tests (no GCP / store). */
export function makeRun(overrides: Partial<InvestigationRun> = {}): InvestigationRun {
  return {
    id: "run_test",
    status: "running",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
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
    ...overrides,
  };
}
