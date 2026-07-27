import { runs, activeRunId, setActiveRunId } from "./memory.js";

export function getActiveRunId(): string | null {
  return activeRunId;
}

export function tryAcquireLock(runId: string): boolean {
  if (!activeRunId || activeRunId === runId) {
    setActiveRunId(runId);
    return true;
  }
  const active = runs.get(activeRunId);
  const busy = active && ["queued", "running", "awaiting_approval", "remediating"].includes(active.status);
  if (busy) return false;
  setActiveRunId(runId);
  return true;
}

export function releaseLock(runId: string): void {
  if (activeRunId === runId) setActiveRunId(null);
}
