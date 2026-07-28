import { runEvalScenario } from "../eval/scenario.js";
import {
  createSoakJob,
  getSoak,
  isInvestigationBusy,
  isSoakBusy,
  releaseSoakLock,
  saveSoak,
  SCENARIO_ORDER,
  tryAcquireSoakLock,
  type SoakJob,
} from "../store/soaks.js";

export {
  getSoak,
  getActiveSoak,
  isSoakBusy,
  isInvestigationBusy,
  cancelActiveSoak,
} from "../store/soaks.js";

export function startSoak(): SoakJob {
  if (isSoakBusy()) {
    throw new Error("a soak is already running (max concurrent = 1)");
  }
  if (isInvestigationBusy()) {
    throw new Error("another investigation is already active (max concurrent = 1)");
  }

  const job = createSoakJob();
  if (!tryAcquireSoakLock(job.id)) {
    job.status = "failed";
    job.error = "another investigation is already active (max concurrent = 1)";
    saveSoak(job);
    throw new Error(job.error);
  }

  job.status = "running";
  saveSoak(job);

  void runSoakBackground(job.id).catch((err) => {
    const current = getSoak(job.id);
    if (current) {
      current.status = "failed";
      current.error = err instanceof Error ? err.message : String(err);
      saveSoak(current);
    }
    releaseSoakLock(job.id);
    console.error(`[soak] background failure ${job.id}:`, err);
  });

  return job;
}

async function runSoakBackground(soakId: string): Promise<void> {
  const job = getSoak(soakId);
  if (!job) return;

  for (let i = 0; i < SCENARIO_ORDER.length; i++) {
    const latest = getSoak(soakId);
    if (!latest || latest.status !== "running") {
      releaseSoakLock(soakId);
      return;
    }

    const scenario = SCENARIO_ORDER[i]!;
    latest.currentScenario = scenario;
    latest.currentRunId = null;
    latest.results[i] = { scenario, phase: "running" };
    saveSoak(latest);

    try {
      const result = await runEvalScenario(scenario, {
        onRunCreated: (runId) => {
          const current = getSoak(soakId);
          if (!current || current.status !== "running") return;
          current.currentRunId = runId;
          current.results[i] = { ...current.results[i]!, scenario, phase: "running", runId };
          saveSoak(current);
        },
      });
      const current = getSoak(soakId);
      if (!current || current.status !== "running") {
        releaseSoakLock(soakId);
        return;
      }
      current.results[i] = {
        scenario,
        phase: result.ok ? "passed" : "failed",
        ok: result.ok,
        matched: result.matched,
        healthy: result.healthy,
        predicted: result.predicted,
        expected: result.expected,
        costUsd: result.costUsd,
        runId: result.runId,
        reason: result.reason,
      };
      if (result.runId) current.currentRunId = result.runId;
      if (result.ok) current.passed += 1;
      current.totalCostUsd += result.costUsd ?? 0;
      saveSoak(current);
    } catch (err) {
      const current = getSoak(soakId);
      if (!current || current.status !== "running") {
        releaseSoakLock(soakId);
        return;
      }
      const reason = err instanceof Error ? err.message : String(err);
      current.results[i] = { scenario, phase: "failed", ok: false, reason };
      saveSoak(current);
    }
  }

  const done = getSoak(soakId);
  if (done && done.status === "running") {
    done.currentScenario = null;
    done.status = "completed";
    saveSoak(done);
  }
  releaseSoakLock(soakId);
}
