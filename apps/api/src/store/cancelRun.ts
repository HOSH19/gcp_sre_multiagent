import type { InvestigationRun } from "@gcp-sre/shared";
import { releaseLock } from "./lock.js";
import { saveRun } from "./runs.js";

export const CANCELLABLE_STATUSES = new Set([
  "queued",
  "running",
  "awaiting_approval",
  "remediating",
]);

/** Fail a busy run and release its investigation lease. Returns false when status is not cancellable. */
export async function cancelBusyRun(run: InvestigationRun, error: string): Promise<boolean> {
  if (!CANCELLABLE_STATUSES.has(run.status)) return false;
  run.status = "failed";
  run.error = error;
  await saveRun(run);
  await releaseLock(run.id);
  return true;
}
