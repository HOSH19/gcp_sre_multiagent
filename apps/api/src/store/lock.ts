import { config } from "../config.js";
import {
  INVESTIGATION_LOCK_SCOPE,
  firestoreCountActiveLeases,
  firestoreGetActiveLeaseRunId,
  firestoreListActiveLeases,
  firestoreReleaseLease,
  firestoreTryAcquireLease,
} from "./firestore.js";
import { getRun, saveRun } from "./runs.js";
import {
  activeRunId,
  activeRunIds,
  addActiveRunId,
  removeActiveRunId,
  setActiveRunId,
} from "./memory.js";

const BUSY = new Set(["queued", "running", "awaiting_approval", "remediating"]);

export async function getActiveRunId(): Promise<string | null> {
  if (config.useDurableStore) {
    return firestoreGetActiveLeaseRunId(INVESTIGATION_LOCK_SCOPE);
  }
  return activeRunId;
}

export async function listActiveRunIds(): Promise<string[]> {
  if (config.useDurableStore) {
    const holders = await firestoreListActiveLeases(INVESTIGATION_LOCK_SCOPE);
    return holders.map((h) => h.runId);
  }
  return [...activeRunIds];
}

export async function countActiveLeases(): Promise<number> {
  if (config.useDurableStore) {
    return firestoreCountActiveLeases(INVESTIGATION_LOCK_SCOPE);
  }
  return activeRunIds.size;
}

export async function tryAcquireLock(runId: string): Promise<boolean> {
  if (config.useDurableStore) {
    const ok = await firestoreTryAcquireLease(
      INVESTIGATION_LOCK_SCOPE,
      runId,
      config.maxConcurrentRuns,
    );
    if (!ok) return false;
    const run = await getRun(runId);
    if (run) {
      run.leaseOwner = config.instanceId;
      run.leaseExpiresAt = new Date(Date.now() + config.leaseTtlMs).toISOString();
      await saveRun(run);
    }
    addActiveRunId(runId);
    return true;
  }

  if (activeRunIds.has(runId)) {
    addActiveRunId(runId);
    return true;
  }

  for (const id of [...activeRunIds]) {
    const holder = await getRun(id);
    if (!holder || !BUSY.has(holder.status)) {
      removeActiveRunId(id);
    }
  }

  if (activeRunIds.size >= config.maxConcurrentRuns) return false;
  addActiveRunId(runId);
  return true;
}

export async function releaseLock(runId: string): Promise<void> {
  if (config.useDurableStore) {
    await firestoreReleaseLease(INVESTIGATION_LOCK_SCOPE, runId);
    const run = await getRun(runId);
    if (run) {
      run.leaseOwner = undefined;
      run.leaseExpiresAt = undefined;
      await saveRun(run);
    }
  }
  removeActiveRunId(runId);
  if (activeRunIds.size === 0) setActiveRunId(null);
}
