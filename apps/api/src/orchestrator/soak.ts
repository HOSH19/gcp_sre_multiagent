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

export async function startSoak(): Promise<SoakJob> {
  if (await isSoakBusy()) {
    throw new Error("a soak is already running (max concurrent = 1)");
  }
  if (await isInvestigationBusy()) {
    throw new Error("another investigation is already active (max concurrent = 1)");
  }

  const job = await createSoakJob();
  if (!(await tryAcquireSoakLock(job.id))) {
    job.status = "failed";
    job.error = "another investigation is already active (max concurrent = 1)";
    await saveSoak(job);
    throw new Error(job.error);
  }

  job.status = "running";
  await saveSoak(job);

  void runSoakBackground(job.id).catch(async (err) => {
    const current = await getSoak(job.id);
    if (current) {
      current.status = "failed";
      current.error = err instanceof Error ? err.message : String(err);
      await saveSoak(current);
    }
    await releaseSoakLock(job.id);
    console.error(`[soak] background failure ${job.id}:`, err);
  });

  return job;
}

async function runSoakBackground(soakId: string): Promise<void> {
  const job = await getSoak(soakId);
  if (!job) return;

  for (let i = 0; i < SCENARIO_ORDER.length; i++) {
    const latest = await getSoak(soakId);
    if (!latest || latest.status !== "running") {
      await releaseSoakLock(soakId);
      return;
    }

    const scenario = SCENARIO_ORDER[i]!;
    latest.currentScenario = scenario;
    latest.currentRunId = null;
    latest.results[i] = { scenario, phase: "running" };
    await saveSoak(latest);

    try {
      const result = await runEvalScenario(scenario, {
        onRunCreated: async (runId) => {
          const current = await getSoak(soakId);
          if (!current || current.status !== "running") return;
          current.currentRunId = runId;
          current.results[i] = { ...current.results[i]!, scenario, phase: "running", runId };
          await saveSoak(current);
        },
      });
      const current = await getSoak(soakId);
      if (!current || current.status !== "running") {
        await releaseSoakLock(soakId);
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
      await saveSoak(current);
    } catch (err) {
      const current = await getSoak(soakId);
      if (!current || current.status !== "running") {
        await releaseSoakLock(soakId);
        return;
      }
      const reason = err instanceof Error ? err.message : String(err);
      current.results[i] = { scenario, phase: "failed", ok: false, reason };
      await saveSoak(current);
    }
  }

  const done = await getSoak(soakId);
  if (done && done.status === "running") {
    done.currentScenario = null;
    done.status = "completed";
    await saveSoak(done);
  }
  await releaseSoakLock(soakId);
}
