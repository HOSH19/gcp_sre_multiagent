import type { InvestigationRun } from "@gcp-sre/shared";
import { config } from "../config.js";
import { findActiveRunForTarget } from "../fleet/correlate.js";
import { queueNotifyRunStatus } from "../paging/index.js";
import { appendEvent, getRun, releaseLock, saveRun, syncRunToFirestore, tryAcquireLock } from "../store/index.js";
import { listActiveRunIds } from "../store/lock.js";
import { runDetector, runHypothesis, runLogDiver, runMitigatorPropose } from "./agents.js";

const BUSY = new Set(["queued", "running", "awaiting_approval", "remediating"]);

/**
 * Enforce MAX_CONCURRENT_PER_SERVICE (default 1) before taking a global lease.
 * Alert correlation attaches repeats; this blocks a second investigation for the same target.
 */
async function hasPerServiceCapacity(run: InvestigationRun): Promise<boolean> {
  const target = run.targetService || run.patientService;
  if (!target) return true;

  const active = await findActiveRunForTarget({
    targetService: target,
    projectId: run.projectId ?? config.projectId,
    region: run.region ?? config.region,
  });
  if (!active || active.id === run.id) return true;
  if (config.maxConcurrentPerService <= 1) return false;

  const ids = await listActiveRunIds();
  let count = 0;
  for (const id of ids) {
    if (id === run.id) continue;
    const peer = await getRun(id);
    if (!peer || !BUSY.has(peer.status)) continue;
    const name = peer.targetService || peer.patientService;
    if (name !== target) continue;
    if (run.projectId && peer.projectId && peer.projectId !== run.projectId) continue;
    if (run.region && peer.region && peer.region !== run.region) continue;
    count += 1;
  }
  return count < config.maxConcurrentPerService;
}

export async function startInvestigation(runId: string): Promise<InvestigationRun> {
  const run = await getRun(runId);
  if (!run) throw new Error("run not found");

  if (!(await hasPerServiceCapacity(run))) {
    run.status = "failed";
    run.error = `target ${run.targetService ?? run.patientService} already has an active investigation (max per service = ${config.maxConcurrentPerService})`;
    await saveRun(run);
    throw new Error(run.error);
  }

  if (!(await tryAcquireLock(runId))) {
    run.status = "failed";
    run.error = `investigation capacity reached (max concurrent = ${config.maxConcurrentRuns})`;
    await saveRun(run);
    throw new Error(run.error);
  }

  run.status = "running";
  await saveRun(run);

  try {
    await appendEvent(run.id, {
      agent: "orchestrator",
      type: "status",
      message:
        `Investigation started (trigger=${run.trigger}, target=${run.targetService ?? run.patientService}` +
        `, scenario=${run.scenario ?? "none"}, react=${config.reactEnabled ? "on" : "off"})`,
    });
    await runDetector(run);
    await runLogDiver(run);
    await runHypothesis(run);
    await runMitigatorPropose(run);
    run.status = "awaiting_approval";
    await saveRun(run);
    await syncRunToFirestore(run);
    await appendEvent(run.id, { agent: "orchestrator", type: "status", message: "Paused for human approval" });
    queueNotifyRunStatus(
      run,
      "awaiting_approval",
      `Remediation proposed for ${run.targetService ?? run.patientService}; human approval required.`,
    );
    return run;
  } catch (err) {
    run.status = "failed";
    run.error = err instanceof Error ? err.message : String(err);
    await appendEvent(run.id, { agent: "orchestrator", type: "error", message: run.error });
    await saveRun(run);
    await releaseLock(runId);
    queueNotifyRunStatus(run, "failed", run.error);
    throw err;
  }
}
