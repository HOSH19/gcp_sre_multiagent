import { newId, nowIso, SCENARIOS, type ScenarioId } from "@gcp-sre/shared";
import { getActiveRunId } from "./lock.js";
import { getRun } from "./runs.js";
import {
  activeSoakId,
  setActiveSoakId,
  soaks,
  type SoakJob,
  type SoakScenarioResult,
} from "./soakMemory.js";

export type { SoakJob, SoakScenarioResult } from "./soakMemory.js";

const SCENARIO_ORDER = Object.keys(SCENARIOS) as ScenarioId[];

export function getSoak(id: string): SoakJob | undefined {
  return soaks.get(id);
}

export function getActiveSoakId(): string | null {
  return activeSoakId;
}

export function isSoakBusy(): boolean {
  if (!activeSoakId) return false;
  const soak = soaks.get(activeSoakId);
  return Boolean(soak && (soak.status === "queued" || soak.status === "running"));
}

export function isInvestigationBusy(): boolean {
  const id = getActiveRunId();
  if (!id) return false;
  const run = getRun(id);
  return Boolean(run && ["queued", "running", "awaiting_approval", "remediating"].includes(run.status));
}

function saveSoak(job: SoakJob): SoakJob {
  job.updatedAt = nowIso();
  soaks.set(job.id, job);
  return job;
}

export function createSoakJob(): SoakJob {
  const now = nowIso();
  const results: SoakScenarioResult[] = SCENARIO_ORDER.map((scenario) => ({
    scenario,
    phase: "pending",
  }));
  const job: SoakJob = {
    id: newId("soak"),
    status: "queued",
    createdAt: now,
    updatedAt: now,
    autoApprove: true,
    currentScenario: null,
    currentRunId: null,
    results,
    passed: 0,
    total: SCENARIO_ORDER.length,
    totalCostUsd: 0,
  };
  soaks.set(job.id, job);
  return job;
}

export function tryAcquireSoakLock(soakId: string): boolean {
  if (isSoakBusy() && activeSoakId !== soakId) return false;
  if (isInvestigationBusy()) return false;
  setActiveSoakId(soakId);
  return true;
}

export function releaseSoakLock(soakId: string): void {
  if (activeSoakId === soakId) setActiveSoakId(null);
}

/** Mark active soak failed and clear the in-memory lock (does not stop an in-flight run). */
export function cancelActiveSoak(reason = "cancelled by operator"): SoakJob | null {
  const id = activeSoakId;
  if (!id) return null;
  const soak = soaks.get(id);
  if (!soak) {
    setActiveSoakId(null);
    return null;
  }
  if (soak.status === "queued" || soak.status === "running") {
    soak.status = "failed";
    soak.error = reason;
    soak.currentScenario = null;
    saveSoak(soak);
  }
  setActiveSoakId(null);
  return soak;
}

export function getActiveSoak(): SoakJob | null {
  if (!activeSoakId) return null;
  return soaks.get(activeSoakId) ?? null;
}

export { saveSoak, SCENARIO_ORDER };
