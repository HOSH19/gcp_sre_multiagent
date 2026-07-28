import type { InvestigationRun, ScenarioId } from "@gcp-sre/shared";
import { config } from "../config.js";
import { createRun, getRun, saveRun } from "../store/index.js";
import { chaosFetch } from "../tools/chaosClient.js";
import { startInvestigation } from "./investigate.js";

async function injectChaos(scenario: ScenarioId): Promise<void> {
  const res = await chaosFetch(`/inject/${scenario}`, { method: "POST" });
  // Chaos may return HTTP 502 when the patient is intentionally unhealthy after inject
  // (e.g. http_500s); trust the JSON `ok` flag.
  const body = res.body as { ok?: boolean; error?: string };
  if (body.ok !== true) {
    throw new Error(`chaos inject failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
}

/** Inject + investigate, waiting until awaiting_approval (evals / sync callers). */
export async function injectAndInvestigate(opts: {
  scenario: ScenarioId;
  trigger: InvestigationRun["trigger"];
}): Promise<InvestigationRun> {
  await injectChaos(opts.scenario);
  const run = createRun({
    trigger: opts.trigger,
    scenario: opts.scenario,
    patientService: config.patientServiceName,
  });
  return startInvestigation(run.id);
}

/**
 * Inject + create run, then continue investigation in the background.
 * Returns immediately so the UI can poll live timeline events.
 */
export async function injectAndQueueInvestigation(opts: {
  scenario: ScenarioId;
  trigger: InvestigationRun["trigger"];
}): Promise<InvestigationRun> {
  await injectChaos(opts.scenario);
  const run = createRun({
    trigger: opts.trigger,
    scenario: opts.scenario,
    patientService: config.patientServiceName,
  });
  run.status = "queued";
  saveRun(run);
  void startInvestigation(run.id).catch((err) => {
    console.error(`[investigate] background failure ${run.id}:`, err);
  });
  return getRun(run.id)!;
}
