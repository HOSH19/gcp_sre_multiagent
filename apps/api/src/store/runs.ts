import { newId, nowIso, type InvestigationRun, type ScenarioId } from "@gcp-sre/shared";
import { runs } from "./memory.js";

export function listRuns(): InvestigationRun[] {
  return [...runs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getRun(id: string): InvestigationRun | undefined {
  return runs.get(id);
}

export function saveRun(run: InvestigationRun): InvestigationRun {
  run.updatedAt = nowIso();
  runs.set(run.id, run);
  return run;
}

export function createRun(input: {
  trigger: InvestigationRun["trigger"];
  scenario?: ScenarioId;
  patientService: string;
}): InvestigationRun {
  const now = nowIso();
  const id = newId("run");
  const run: InvestigationRun = {
    id,
    status: "queued",
    createdAt: now,
    updatedAt: now,
    trigger: input.trigger,
    scenario: input.scenario,
    patientService: input.patientService,
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
    shareUrl: `/runs/${id}`,
  };
  runs.set(id, run);
  return run;
}
