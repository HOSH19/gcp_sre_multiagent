import { chaosState } from "./chaosClient.js";
import { evidence } from "./evidence.js";

const ERRORS: Record<string, Array<{ message: string; count: number }>> = {
  http_500s: [{ message: "Error: forced_500 from chaos endpoint", count: 42 }],
  missing_config: [{ message: "Misconfigured: APP_SECRET missing", count: 18 }],
  bad_revision_traffic: [{ message: "Revision failed readiness: unhealthy_revision", count: 27 }],
};

export async function listRecentErrors() {
  const state = await chaosState();
  const errors = ERRORS[state.activeScenario ?? ""] ?? [{ message: "No recent error groups", count: 0 }];
  return evidence(
    "listRecentErrors",
    `Error groups: ${errors.map((e) => `${e.message} (n=${e.count})`).join("; ")}`,
    { errors },
  );
}

export async function getErrorGroup() {
  return listRecentErrors();
}

export async function getUptimeCheckState() {
  const { getServiceHealth } = await import("./health.js");
  const health = await getServiceHealth();
  const ok = Boolean((health.raw as { patient?: { ok?: boolean } })?.patient?.ok);
  return evidence("getUptimeCheckState", ok ? "Uptime check passing" : "Uptime check failing", {
    passing: ok,
    derivedFrom: health.id,
  });
}
