import { newId, nowIso, SCENARIOS, type ScenarioId } from "@gcp-sre/shared";
import { config } from "../config.js";
import {
  SOAK_LOCK_SCOPE,
  firestoreGetActiveSoakId,
  firestoreGetSoak,
  firestoreReleaseLease,
  firestoreSaveSoak,
  firestoreTryAcquireLease,
} from "./firestore.js";
import { isAnyInvestigationBusy } from "./lock.js";
import {
  activeSoakId,
  setActiveSoakId,
  soaks,
  type SoakJob,
  type SoakScenarioResult,
} from "./soakMemory.js";

export type { SoakJob, SoakScenarioResult } from "./soakMemory.js";

const SCENARIO_ORDER = Object.keys(SCENARIOS) as ScenarioId[];

export async function getSoak(id: string): Promise<SoakJob | undefined> {
  const cached = soaks.get(id);
  if (cached) return cached;
  if (config.useDurableStore) {
    const fromFs = await firestoreGetSoak(id);
    if (fromFs) soaks.set(id, fromFs);
    return fromFs;
  }
  return undefined;
}

export async function getActiveSoakId(): Promise<string | null> {
  if (config.useDurableStore) {
    return firestoreGetActiveSoakId();
  }
  return activeSoakId;
}

export async function isSoakBusy(): Promise<boolean> {
  const id = await getActiveSoakId();
  if (!id) return false;
  const soak = await getSoak(id);
  return Boolean(soak && (soak.status === "queued" || soak.status === "running"));
}

export async function isInvestigationBusy(): Promise<boolean> {
  return isAnyInvestigationBusy();
}

export async function saveSoak(job: SoakJob): Promise<SoakJob> {
  job.updatedAt = nowIso();
  soaks.set(job.id, job);
  if (config.useDurableStore) {
    await firestoreSaveSoak(job);
  }
  return job;
}

export async function createSoakJob(): Promise<SoakJob> {
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
  if (config.useDurableStore) {
    await firestoreSaveSoak(job);
  }
  return job;
}

export async function tryAcquireSoakLock(soakId: string): Promise<boolean> {
  if (config.useDurableStore) {
    if (await isInvestigationBusy()) return false;
    const ok = await firestoreTryAcquireLease(SOAK_LOCK_SCOPE, soakId, 1);
    if (ok) setActiveSoakId(soakId);
    return ok;
  }
  if ((await isSoakBusy()) && activeSoakId !== soakId) return false;
  if (await isInvestigationBusy()) return false;
  setActiveSoakId(soakId);
  return true;
}

export async function releaseSoakLock(soakId: string): Promise<void> {
  if (config.useDurableStore) {
    await firestoreReleaseLease(SOAK_LOCK_SCOPE, soakId);
  }
  if (activeSoakId === soakId) setActiveSoakId(null);
}

/** Mark active soak failed and clear the lock (does not stop an in-flight run). */
export async function cancelActiveSoak(reason = "cancelled by operator"): Promise<SoakJob | null> {
  const id = await getActiveSoakId();
  if (!id) return null;
  const soak = await getSoak(id);
  if (!soak) {
    await releaseSoakLock(id);
    return null;
  }
  if (soak.status === "queued" || soak.status === "running") {
    soak.status = "failed";
    soak.error = reason;
    soak.currentScenario = null;
    await saveSoak(soak);
  }
  await releaseSoakLock(id);
  return soak;
}

export async function getActiveSoak(): Promise<SoakJob | null> {
  const id = await getActiveSoakId();
  if (!id) return null;
  return (await getSoak(id)) ?? null;
}

export { SCENARIO_ORDER };
