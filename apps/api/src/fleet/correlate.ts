import type { InvestigationRun } from "@gcp-sre/shared";
import { config } from "../config.js";
import {
  INVESTIGATION_LOCK_SCOPE,
  firestoreListActiveLeases,
} from "../store/firestore.js";
import { getRun, listActiveRunIds, listRuns } from "../store/index.js";

const BUSY = new Set(["queued", "running", "awaiting_approval", "remediating"]);

function matchesTarget(
  run: InvestigationRun,
  opts: { targetService: string; projectId?: string; region?: string },
): boolean {
  const name = run.targetService || run.patientService;
  if (name !== opts.targetService) return false;
  if (opts.projectId && run.projectId && run.projectId !== opts.projectId) return false;
  if (opts.region && run.region && run.region !== opts.region) return false;
  return true;
}

/**
 * Find an in-flight investigation for the same target service.
 * Prefers lease holders (durable + memory multi-concurrent) so correlation is accurate.
 */
export async function findActiveRunForTarget(opts: {
  targetService: string;
  projectId?: string;
  region?: string;
}): Promise<InvestigationRun | undefined> {
  if (config.useDurableStore) {
    try {
      const holders = await firestoreListActiveLeases(INVESTIGATION_LOCK_SCOPE);
      for (const h of holders) {
        const run = await getRun(h.runId);
        if (run && BUSY.has(run.status) && matchesTarget(run, opts)) return run;
      }
    } catch (err) {
      console.warn("[correlate] lease lookup failed; falling back to run scan:", err);
    }
  } else {
    const ids = await listActiveRunIds();
    for (const id of ids) {
      const run = await getRun(id);
      if (run && BUSY.has(run.status) && matchesTarget(run, opts)) return run;
    }
  }

  // Fallback: scan recent runs (covers lease lag).
  const runs = await listRuns();
  return runs.find((r) => BUSY.has(r.status) && matchesTarget(r, opts));
}
