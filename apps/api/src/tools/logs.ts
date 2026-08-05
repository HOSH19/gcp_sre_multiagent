import { config } from "../config.js";
import { fetchCloudRunRevisions, fetchCloudRunService } from "../gcp/cloudRun.js";
import { queryServiceLogs } from "../gcp/logging.js";
import { chaosState } from "./chaosClient.js";
import { evidence } from "./evidence.js";
import { serviceRefFromRun } from "./target.js";
import type { ToolCallContext } from "./types.js";

const LOGS: Record<string, string[]> = {
  http_500s: ["POST / -> 500 forced_500", "GET /healthz -> 500 chaos_force_500"],
  missing_config: ["Boot warning: REQUIRED_CONFIG_KEY unset", "GET /healthz -> 503 missing_required_env"],
  bad_revision_traffic: ["Revision patient-bad serving 100% traffic", "GET /healthz -> 503 unhealthy_revision"],
};

export async function queryLogs(ctx?: ToolCallContext) {
  const ref = serviceRefFromRun(ctx?.run);
  if (config.mode === "gcp") {
    try {
      const entries = await queryServiceLogs({
        pageSize: 30,
        serviceName: ref.name,
        projectId: ref.projectId,
        region: ref.region,
      });
      const lines = entries.map((e) => {
        const rev = e.revision ? ` rev=${e.revision}` : "";
        const sev = e.severity ? `[${e.severity}] ` : "";
        return `${sev}${e.message}${rev}`.slice(0, 400);
      });
      const preview = lines[0] ?? "(no recent log entries)";
      return evidence("queryLogs", `Recent Cloud Logging entries (${lines.length}): ${preview}`, {
        lines,
        service: ref.name,
        source: "cloud_logging",
      });
    } catch (err) {
      const state = await chaosState();
      const lines = LOGS[state.activeScenario ?? ""] ?? ["GET /healthz -> 200"];
      return evidence("queryLogs", `Cloud Logging unavailable; fallback (${String(err)})`, {
        lines,
        source: "fallback",
        error: String(err),
      });
    }
  }

  const state = await chaosState();
  const lines = LOGS[state.activeScenario ?? ""] ?? ["GET /healthz -> 200"];
  return evidence("queryLogs", `Recent logs (${lines.length}): ${lines[0]}`, { lines, source: "canned" });
}

export async function listRevisions(ctx?: ToolCallContext) {
  const ref = serviceRefFromRun(ctx?.run);
  if (config.mode === "gcp") {
    try {
      const revisions = await fetchCloudRunRevisions(ref);
      return evidence(
        "listRevisions",
        `Revisions: ${revisions.map((r) => `${r.name}(${r.healthy ? "healthy" : "unhealthy"})`).join(", ")}`,
        { revisions, service: ref.name, source: "cloud_run" },
      );
    } catch (err) {
      const state = await chaosState();
      const revisions = [
        { name: state.goodRevision ?? "patient-good-00001", healthy: true },
        { name: state.badRevision ?? "patient-bad-00002", healthy: false },
      ];
      return evidence("listRevisions", `Cloud Run list failed; fallback (${String(err)})`, {
        revisions,
        source: "fallback",
        error: String(err),
      });
    }
  }

  const state = await chaosState();
  const revisions = [
    { name: state.goodRevision ?? "patient-good-00001", healthy: true },
    { name: state.badRevision ?? "patient-bad-00002", healthy: false },
  ];
  return evidence(
    "listRevisions",
    `Revisions: ${revisions.map((r) => `${r.name}(${r.healthy ? "healthy" : "unhealthy"})`).join(", ")}`,
    { revisions, source: "chaos_state" },
  );
}

export async function getRevisionTraffic(ctx?: ToolCallContext) {
  const ref = serviceRefFromRun(ctx?.run);
  if (config.mode === "gcp") {
    try {
      const { traffic } = await fetchCloudRunService(ref);
      return evidence("getRevisionTraffic", `Traffic split: ${JSON.stringify(traffic)}`, {
        traffic,
        service: ref.name,
        source: "cloud_run",
      });
    } catch (err) {
      const state = await chaosState();
      const traffic = state.traffic ?? {};
      return evidence("getRevisionTraffic", `Cloud Run traffic read failed; fallback (${String(err)})`, {
        traffic,
        source: "fallback",
        error: String(err),
      });
    }
  }

  const state = await chaosState();
  const traffic = state.traffic ?? {};
  return evidence("getRevisionTraffic", `Traffic split: ${JSON.stringify(traffic)}`, {
    traffic,
    source: "chaos_state",
  });
}

export async function getServiceEnv(ctx?: ToolCallContext) {
  const ref = serviceRefFromRun(ctx?.run);
  if (config.mode === "gcp") {
    try {
      const { env } = await fetchCloudRunService(ref);
      const hasAppSecret = Object.keys(env).includes("APP_SECRET");
      return evidence(
        "getServiceEnv",
        hasAppSecret ? "Required env APP_SECRET is present" : "Required env APP_SECRET is MISSING",
        { keys: Object.keys(env), hasAppSecret, service: ref.name, source: "cloud_run" },
      );
    } catch (err) {
      const state = await chaosState();
      const env = state.env ?? {};
      const hasAppSecret = Object.keys(env).includes("APP_SECRET");
      return evidence("getServiceEnv", `Cloud Run env read failed; fallback (${String(err)})`, {
        keys: Object.keys(env),
        hasAppSecret,
        source: "fallback",
        error: String(err),
      });
    }
  }

  const state = await chaosState();
  const env = state.env ?? {};
  const hasAppSecret = Object.keys(env).includes("APP_SECRET");
  return evidence(
    "getServiceEnv",
    hasAppSecret ? "Required env APP_SECRET is present" : "Required env APP_SECRET is MISSING",
    { keys: Object.keys(env), hasAppSecret, source: "chaos_state" },
  );
}
