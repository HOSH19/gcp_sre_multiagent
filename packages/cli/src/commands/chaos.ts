import { SCENARIOS, type ScenarioId } from "@gcp-sre/shared";
import { chaosPost } from "../chaosHttp.js";
import { usage } from "../usage.js";

/** Print known chaos scenarios. */
export async function cmdScenarios() {
  console.log(JSON.stringify(Object.values(SCENARIOS), null, 2));
}

/** Inject a chaos scenario into the patient service. */
export async function cmdInject(scenario: string) {
  if (!SCENARIOS[scenario as ScenarioId]) usage();
  console.log(await chaosPost(`/inject/${scenario}`));
}

/** Reset patient service to a healthy baseline. */
export async function cmdReset() {
  console.log(await chaosPost("/reset"));
}
