import type { InvestigationRun, ScenarioId } from "@gcp-sre/shared";
import { config } from "../config.js";
import { appendEvent, createRun, getRun, saveRun } from "../store/index.js";
import { injectChaosScenario } from "../tools/chaosClient.js";
import { assertInvestigationCapacity, startInvestigation } from "./investigate.js";

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
        message: `Chaos injected (${opts.scenario}); starting investigation`,
      });
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
