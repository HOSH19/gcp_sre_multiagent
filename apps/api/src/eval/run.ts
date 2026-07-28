import { SCENARIOS, type ScenarioId } from "@gcp-sre/shared";
import { runEvalScenario } from "./scenario.js";

async function main() {
  const results = [];
  for (const scenario of Object.keys(SCENARIOS) as ScenarioId[]) {
    console.log(`\n=== eval ${scenario} ===`);
    try {
      const result = await runEvalScenario(scenario);
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
