import { chaosState } from "./chaosClient.js";
import { evidence } from "./evidence.js";

const LOGS: Record<string, string[]> = {
  http_500s: ["POST / -> 500 forced_500", "GET /healthz -> 500 chaos_force_500"],
  missing_config: ["Boot warning: REQUIRED_CONFIG_KEY unset", "GET /healthz -> 503 missing_required_env"],
  bad_revision_traffic: ["Revision patient-bad serving 100% traffic", "GET /healthz -> 503 unhealthy_revision"],
};

export async function queryLogs() {
  const state = await chaosState();
  const lines = LOGS[state.activeScenario ?? ""] ?? ["GET /healthz -> 200"];
  return evidence("queryLogs", `Recent logs (${lines.length}): ${lines[0]}`, { lines });
}

export async function listRevisions() {
  const state = await chaosState();
  const revisions = [
    { name: state.goodRevision ?? "patient-good-00001", healthy: true },
    { name: state.badRevision ?? "patient-bad-00002", healthy: false },
  ];
  return evidence(
    "listRevisions",
    `Revisions: ${revisions.map((r) => `${r.name}(${r.healthy ? "healthy" : "unhealthy"})`).join(", ")}`,
    { revisions },
  );
}

export async function getRevisionTraffic() {
  const state = await chaosState();
  const traffic = state.traffic ?? {};
  return evidence("getRevisionTraffic", `Traffic split: ${JSON.stringify(traffic)}`, { traffic });
}

export async function getServiceEnv() {
  const state = await chaosState();
  const env = state.env ?? {};
  const hasAppSecret = Object.keys(env).includes("APP_SECRET");
  return evidence(
    "getServiceEnv",
    hasAppSecret ? "Required env APP_SECRET is present" : "Required env APP_SECRET is MISSING",
    { keys: Object.keys(env), hasAppSecret },
  );
}
