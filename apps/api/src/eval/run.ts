import { SCENARIOS, type ScenarioId } from "@gcp-sre/shared";
import { config } from "../config.js";
import { injectAndInvestigate, resolveApproval } from "../orchestrator/index.js";

async function resetChaos() {
  await fetch(`${config.chaosControllerUrl}/reset`, {
    method: "POST",
    headers: { "x-chaos-token": config.chaosAdminToken },
  });
}

async function runScenario(scenario: ScenarioId) {
  await resetChaos();
  await new Promise((r) => setTimeout(r, 50));
  const run = await injectAndInvestigate({ scenario, trigger: "eval" });
  if (run.status !== "awaiting_approval") {
    return { scenario, ok: false, reason: `expected awaiting_approval got ${run.status}` };
  }
  const finished = await resolveApproval(run.id, "approved");
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

async function main() {
  const results = [];
  for (const scenario of Object.keys(SCENARIOS) as ScenarioId[]) {
    console.log(`\n=== eval ${scenario} ===`);
    try {
      const result = await runScenario(scenario);
      results.push(result);
      console.log(result);
    } catch (err) {
      results.push({ scenario, ok: false, reason: err instanceof Error ? err.message : String(err) });
      console.error(err);
    }
  }
  const passed = results.filter((r) => "ok" in r && r.ok).length;
  console.log(`\nEval summary: ${passed}/${results.length} passed`);
  if (passed !== results.length) process.exitCode = 1;
}

main();
