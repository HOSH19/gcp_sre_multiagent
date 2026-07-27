import type { InvestigationRun } from "@gcp-sre/shared";
import { appendEvent, getRun, releaseLock, saveRun, syncRunToFirestore, tryAcquireLock } from "../store/index.js";
import { runDetector, runHypothesis, runLogDiver, runMitigatorPropose } from "./agents.js";

export async function startInvestigation(runId: string): Promise<InvestigationRun> {
  const run = getRun(runId);
  if (!run) throw new Error("run not found");
  if (!tryAcquireLock(runId)) {
    run.status = "failed";
    run.error = "another investigation is already active (max concurrent = 1)";
    saveRun(run);
    throw new Error(run.error);
  }

  run.status = "running";
  saveRun(run);

  try {
    appendEvent(run.id, {
      agent: "orchestrator",
      type: "status",
      message: `Investigation started (trigger=${run.trigger}, scenario=${run.scenario ?? "unknown"})`,
    });
    await runDetector(run);
    await runLogDiver(run);
    await runHypothesis(run);
    await runMitigatorPropose(run);
    run.status = "awaiting_approval";
    saveRun(run);
    await syncRunToFirestore(run);
    appendEvent(run.id, { agent: "orchestrator", type: "status", message: "Paused for human approval" });
    return run;
  } catch (err) {
    run.status = "failed";
    run.error = err instanceof Error ? err.message : String(err);
    appendEvent(run.id, { agent: "orchestrator", type: "error", message: run.error });
    saveRun(run);
    releaseLock(runId);
    throw err;
  }
}
