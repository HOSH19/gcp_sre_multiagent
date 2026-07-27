import { SCENARIOS, type ScenarioId } from "@gcp-sre/shared";
import { CHAOS_TOKEN, CHAOS_URL } from "../config.js";
import { usage } from "../usage.js";

export async function cmdScenarios() {
  console.log(JSON.stringify(Object.values(SCENARIOS), null, 2));
}

export async function cmdInject(scenario: string) {
  if (!SCENARIOS[scenario as ScenarioId]) usage();
  const res = await fetch(`${CHAOS_URL}/inject/${scenario}`, {
    method: "POST",
    headers: { "x-chaos-token": CHAOS_TOKEN },
  });
  console.log(await res.json());
}

export async function cmdReset() {
  const res = await fetch(`${CHAOS_URL}/reset`, {
    method: "POST",
    headers: { "x-chaos-token": CHAOS_TOKEN },
  });
  console.log(await res.json());
}
