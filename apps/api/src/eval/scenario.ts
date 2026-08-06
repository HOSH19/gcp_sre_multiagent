import type { ScenarioId } from "@gcp-sre/shared";
import { config } from "../config.js";
import { resolveApproval } from "../orchestrator/approval.js";
import { startInvestigation } from "../orchestrator/investigate.js";
import { createRun } from "../store/runs.js";
import { injectChaosScenario, chaosFetch } from "../tools/chaosClient.js";

interface EvalScenarioResult {
  scenario: ScenarioId;
  ok: boolean;
  matched?: boolean;
  healthy?: boolean;
  predicted?: string;
  expected?: string;
  costUsd?: number;
  runId?: string;
  reason?: string;
}

async function resetChaos(): Promise<void> {
  await chaosFetch("/reset", { method: "POST" });
}

/** Reset → inject → investigate → auto-approve (same effectiveness check as CLI eval). */
export async function runEvalScenario(
  scenario: ScenarioId,
  opts?: { onRunCreated?: (runId: string) => void | Promise<void> },
): Promise<EvalScenarioResult> {
  await resetChaos();
  await new Promise((r) => setTimeout(r, 50));
  await injectChaosScenario(scenario);

  const run = await createRun({
    trigger: "eval",
    scenario,
    patientService: config.patientServiceName,
  });
  await opts?.onRunCreated?.(run.id);

  const investigated = await startInvestigation(run.id);
  if (investigated.status !== "awaiting_approval") {
    return {
      scenario,
      ok: false,
      reason: `expected awaiting_approval got ${investigated.status}`,
      runId: investigated.id,
    };
  }

  const finished = await resolveApproval(investigated.id, "approved");
  const matched = finished.report?.eval?.matched === true;
  const healthy = finished.report?.healthAfter?.ok === true;
  return {
    scenario,
    ok: matched && healthy,
    matched,
    healthy,
    predicted: finished.report?.eval?.predicted,
    expected: finished.report?.eval?.expected,
    costUsd: finished.costUsd,
    runId: finished.id,
  };
}
