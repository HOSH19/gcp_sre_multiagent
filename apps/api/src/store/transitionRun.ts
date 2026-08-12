import type { InvestigationRun } from "@gcp-sre/shared";
import { config } from "../config.js";
import { firestoreTryTransitionRunStatus } from "./firestoreRuns.js";
import { runs } from "./memory.js";
import { getRun, saveRun } from "./runs.js";

/**
 * Atomically move a run from one status to another.
 * Returns false when the run is missing or not in the expected status.
 */
export async function tryTransitionRunStatus(
  runId: string,
  from: InvestigationRun["status"],
  to: InvestigationRun["status"],
): Promise<boolean> {
  if (config.useDurableStore) {
    const ok = await firestoreTryTransitionRunStatus(runId, from, to);
    if (!ok) return false;
    const run = await getRun(runId);
    if (run) {
      run.status = to;
      runs.set(runId, run);
    }
    return true;
  }

  const run = runs.get(runId) ?? (await getRun(runId));
  if (!run || run.status !== from) return false;
  run.status = to;
  await saveRun(run);
  return true;
}
