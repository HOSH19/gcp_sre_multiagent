import type { ScenarioId } from "@gcp-sre/shared";
import { localState, MODE } from "./config.js";
import { patientChaos } from "./patientClient.js";

export async function injectScenario(scenario: ScenarioId) {
  localState.activeScenario = scenario;
  if (scenario === "http_500s") {
    localState.traffic = { [localState.goodRevision]: 100, [localState.badRevision]: 0 };
    localState.env.APP_SECRET = localState.env.APP_SECRET || "local-secret";
    return patientChaos("/chaos/500", { enabled: true });
  }
  if (scenario === "missing_config") {
    await patientChaos("/chaos/reset");
    delete localState.env.APP_SECRET;
    return {
      status: 200,
      body: { ok: true, scenario, note: "Local mode: APP_SECRET removed from controller state." },
    };
  }
  await patientChaos("/chaos/reset");
  localState.env.APP_SECRET = localState.env.APP_SECRET || "local-secret";
  localState.traffic = { [localState.goodRevision]: 0, [localState.badRevision]: 100 };
  return {
    status: 200,
    body: {
      ok: true,
      scenario,
      traffic: localState.traffic,
      note: MODE === "gcp" ? "Would shift Cloud Run traffic to bad revision" : "Local mode: traffic on bad revision",
    },
  };
}

export async function resetAll() {
  localState.activeScenario = null;
  localState.traffic = { [localState.goodRevision]: 100, [localState.badRevision]: 0 };
  localState.env.APP_SECRET = "local-secret";
  return { patient: await patientChaos("/chaos/reset"), localState };
}

export function rollbackTraffic() {
  localState.traffic = { [localState.goodRevision]: 100, [localState.badRevision]: 0 };
  if (localState.activeScenario === "bad_revision_traffic") localState.activeScenario = null;
  return localState.traffic;
}

export function patchEnv(vars: Record<string, string>) {
  Object.assign(localState.env, vars);
  if (localState.activeScenario === "missing_config" && localState.env.APP_SECRET) {
    localState.activeScenario = null;
  }
  return localState.env;
}
