import type { InvestigationRun } from "@gcp-sre/shared";
import { config } from "../config.js";
import {
  INVESTIGATION_LOCK_SCOPE,
  firestoreListActiveLeases,
} from "../store/firestore.js";
import { getRun, listActiveRunIds, listRuns } from "../store/index.js";

const BUSY = new Set(["queued", "running", "awaiting_approval", "remediating"]);

/** Queued runs with no lease yet (background start on Cloud Run). */
const QUEUED_WITHOUT_LEASE_MS = 2 * 60 * 1000;

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
 * True when a run should count against per-service concurrency (lease, fresh queued, or recent worker heartbeat).
 * Ignores orphaned Firestore rows left in BUSY after lease expiry or instance loss.
 */
export function isActiveInvestigationRun(
  run: InvestigationRun,
  leasedRunIds: ReadonlySet<string>,
  now = Date.now(),
): boolean {
  if (!BUSY.has(run.status)) return false;
  if (leasedRunIds.has(run.id)) return true;
  if (run.status === "queued") {
    return now - Date.parse(run.createdAt) < QUEUED_WITHOUT_LEASE_MS;
  }
  const leaseEnd = run.leaseExpiresAt ? Date.parse(run.leaseExpiresAt) : 0;
  if (leaseEnd > now) return true;
  return now - Date.parse(run.updatedAt) < config.leaseTtlMs;
}

async function leasedRunIdSet(): Promise<Set<string>> {
  if (config.useDurableStore) {
    try {
      const holders = await firestoreListActiveLeases(INVESTIGATION_LOCK_SCOPE);
      return new Set(holders.map((h) => h.runId));
    } catch (err) {
      console.warn("[correlate] lease lookup failed; falling back to run scan:", err);
      return new Set();
    }
  }
  return new Set(await listActiveRunIds());
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
  const leasedRunIds = await leasedRunIdSet();

  for (const runId of leasedRunIds) {
    const run = await getRun(runId);
    if (run && isActiveInvestigationRun(run, leasedRunIds) && matchesTarget(run, opts)) {
      return run;
    }
  }

  const runs = await listRuns();
  return runs.find(
    (r) => isActiveInvestigationRun(r, leasedRunIds) && matchesTarget(r, opts),
  );
}
