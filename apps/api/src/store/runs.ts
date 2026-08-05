import { newId, nowIso, type InvestigationRun, type MappedAlert, type ScenarioId } from "@gcp-sre/shared";
import { config } from "../config.js";
import { firestoreGetRun, firestoreListRuns, firestoreSaveRun } from "./firestore.js";
import { runs } from "./memory.js";

export async function listRuns(): Promise<InvestigationRun[]> {
  if (config.useDurableStore) {
    const fromFs = await firestoreListRuns();
    for (const run of fromFs) runs.set(run.id, run);
    return fromFs;
  }
  return [...runs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getRun(id: string): Promise<InvestigationRun | undefined> {
  if (config.useDurableStore) {
    const fromFs = await firestoreGetRun(id);
    if (fromFs) {
      const cached = runs.get(id);
      if (cached && Date.parse(cached.updatedAt) >= Date.parse(fromFs.updatedAt)) {
        return cached;
      }
      runs.set(id, fromFs);
      return fromFs;
    }
    return runs.get(id);
  }
  return runs.get(id);
}

export async function saveRun(run: InvestigationRun): Promise<InvestigationRun> {
  run.updatedAt = nowIso();
  if (!run.targetService) run.targetService = run.patientService;
  if (!run.patientService) run.patientService = run.targetService;
  runs.set(run.id, run);
  if (config.useDurableStore) {
    await firestoreSaveRun(run);
  }
  return run;
}

export async function createRun(input: {
  trigger: InvestigationRun["trigger"];
  scenario?: ScenarioId;
  patientService?: string;
  targetService?: string;
  projectId?: string;
  region?: string;
  alert?: MappedAlert;
}): Promise<InvestigationRun> {
  const now = nowIso();
  const id = newId("run");
  const service =
    input.targetService ??
    input.patientService ??
    input.alert?.service.name ??
    config.patientServiceName;
  const run: InvestigationRun = {
    id,
    status: "queued",
    createdAt: now,
    updatedAt: now,
    trigger: input.trigger,
    scenario: input.scenario,
    patientService: service,
    targetService: service,
    projectId: input.projectId ?? input.alert?.service.projectId ?? config.projectId,
    region: input.region ?? input.alert?.service.region ?? config.region,
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
    alert: input.alert,
  };
  runs.set(id, run);
  if (config.useDurableStore) {
    await firestoreSaveRun(run);
  }
  return run;
}
