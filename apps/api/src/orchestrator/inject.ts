import type { InvestigationRun, ScenarioId } from "@gcp-sre/shared";
import { config } from "../config.js";
import { appendEvent, createRun, getRun, saveRun } from "../store/index.js";
import { injectChaosScenario } from "../tools/chaosClient.js";
import { assertInvestigationCapacity, startInvestigation } from "./investigate.js";

/**
 * Poll patient /health until it returns a non-2xx status (chaos is active) or
 * we time out. This guards against Cloud Run cold-start delay and the window
 * between `patchServiceEnv` completing and the new revision becoming ready.
 */
async function waitForPatientUnhealthy(opts: {
  healthUrl: string;
  timeoutMs?: number;
  intervalMs?: number;
}): Promise<boolean> {
  const { healthUrl, timeoutMs = 60_000, intervalMs = 3_000 } = opts;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(healthUrl, { signal: AbortSignal.timeout(5_000) });
      if (!res.ok) return true;
    } catch {
      return true;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

/**
 * Create a queued run and return immediately so the web UI / BFF never block on
 * chaos inject (Cloud Run traffic/env mutations can take 10–30s) or the agent pipeline.
 * Inject + investigation continue in the background; the console polls `/runs/:id`.
 */
export async function injectAndQueueInvestigation(opts: {
  scenario: ScenarioId;
  trigger: InvestigationRun["trigger"];
}): Promise<InvestigationRun> {
  const run = await createRun({
    trigger: opts.trigger,
    scenario: opts.scenario,
    patientService: config.patientServiceName,
  });
  run.status = "queued";
  await saveRun(run);

  await assertInvestigationCapacity(run);

  await appendEvent(run.id, {
    agent: "orchestrator",
    type: "status",
    message: `Queued; injecting chaos scenario=${opts.scenario}`,
  });

  void (async () => {
    try {
      await injectChaosScenario(opts.scenario);
      await appendEvent(run.id, {
        agent: "orchestrator",
        type: "status",
        message: `Chaos injected (${opts.scenario}); confirming patient is unhealthy…`,
      });

      const unhealthy = await waitForPatientUnhealthy({ healthUrl: config.patientHealthUrl });
      if (!unhealthy) {
        await appendEvent(run.id, {
          agent: "orchestrator",
          type: "status",
          message: `Warning: patient still healthy after inject timeout; proceeding with investigation anyway`,
        });
      } else {
        await appendEvent(run.id, {
          agent: "orchestrator",
          type: "status",
          message: `Patient confirmed unhealthy; starting investigation`,
        });
      }

      await startInvestigation(run.id);
    } catch (err) {
      const current = await getRun(run.id);
      if (current && current.status === "queued") {
        current.status = "failed";
        current.error = err instanceof Error ? err.message : String(err);
        await appendEvent(current.id, {
          agent: "orchestrator",
          type: "error",
          message: current.error,
        });
        await saveRun(current);
      }
      console.error(`[investigate] background failure ${run.id}:`, err);
    }
  })();

  return (await getRun(run.id))!;
}
