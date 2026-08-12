import { config } from "../config.js";
import { registryEntryForRun } from "../fleet/registry.js";
import { formatErrorGroupsSummary, queryServiceErrors } from "../gcp/logging.js";
import { UptimeCheckNotFoundError } from "../gcp/uptimeConfig.js";
import { chaosState } from "./chaosClient.js";
import { evidence } from "./evidence.js";
import { serviceRefFromRun } from "./target.js";
import type { ToolCallContext } from "./types.js";

const ERRORS: Record<string, Array<{ message: string; count: number }>> = {
  missing_config: [{ message: "Misconfigured: APP_SECRET missing", count: 18 }],
  bad_revision_traffic: [{ message: "Revision failed readiness: unhealthy_revision", count: 27 }],
};

export async function listRecentErrors(ctx?: ToolCallContext) {
  const ref = serviceRefFromRun(ctx?.run);
  if (config.mode === "gcp") {
    try {
      const errors = await queryServiceErrors({
        pageSize: 40,
        serviceName: ref.name,
        projectId: ref.projectId,
        region: ref.region,
      });
      return evidence("listRecentErrors", formatErrorGroupsSummary(errors), {
        errors,
        service: ref.name,
        source: "cloud_logging",
        pageSize: 40,
      });
    } catch (err) {
      const state = await chaosState();
      const errors = ERRORS[state.activeScenario ?? ""] ?? [{ message: "No recent error groups", count: 0 }];
      return evidence("listRecentErrors", `Cloud Logging errors unavailable; fallback (${String(err)})`, {
        errors,
        source: "fallback",
        error: String(err),
      });
    }
  }

  const state = await chaosState();
  const errors = ERRORS[state.activeScenario ?? ""] ?? [{ message: "No recent error groups", count: 0 }];
  return evidence("listRecentErrors", formatErrorGroupsSummary(errors), { errors, source: "canned" });
}

export async function getErrorGroup(ctx?: ToolCallContext) {
  return listRecentErrors(ctx);
}

export async function getUptimeCheckState(ctx?: ToolCallContext) {
  if (config.mode === "gcp") {
    const entry = ctx?.run ? await registryEntryForRun(ctx.run) : undefined;
    const serviceName = entry?.name ?? serviceRefFromRun(ctx?.run).name;
    const checkId = entry?.uptimeCheckId || config.uptimeCheckId || undefined;
    const serviceUrl = config.patientServiceUrl || config.patientHealthUrl.replace(/\/health\/?$/, "");

    try {
      const { getLatestUptimeCheckState } = await import("../gcp/monitoring.js");
      const state = await getLatestUptimeCheckState({
        checkId: checkId || undefined,
        serviceUrl,
      });
      const latency = state.latencyMs != null ? `, latency=${state.latencyMs}ms` : "";
      return evidence(
        "getUptimeCheckState",
        state.passing
          ? `Uptime check passing (checkId=${state.checkId}${latency})`
          : `Uptime check failing (checkId=${state.checkId}${latency})`,
        {
          ok: true,
          passing: state.passing,
          latency: state.latencyMs,
          checkId: state.checkId,
          displayName: state.displayName,
          host: state.host,
          path: state.path,
          checkedAt: state.checkedAt,
          service: serviceName,
          source: "cloud_monitoring",
          raw: state.raw,
        },
      );
    } catch (err) {
      if (err instanceof UptimeCheckNotFoundError) {
        return evidence(
          "getUptimeCheckState",
          "Uptime check not configured for this service (run scripts/setup-monitoring.sh or set UPTIME_CHECK_ID)",
          {
            ok: true,
            skipped: true,
            passing: undefined,
            service: serviceName,
            host: err.host,
            source: "cloud_monitoring_skipped",
          },
        );
      }
      return evidence("getUptimeCheckState", `Cloud Monitoring uptime unavailable (${String(err)})`, {
        ok: false,
        passing: false,
        service: serviceName,
        source: "cloud_monitoring_error",
        error: String(err),
      });
    }
  }

  const { getServiceHealth } = await import("./health.js");
  const health = await getServiceHealth();
  const ok = Boolean((health.raw as { patient?: { ok?: boolean } })?.patient?.ok);
  return evidence("getUptimeCheckState", ok ? "Uptime check passing" : "Uptime check failing", {
    passing: ok,
    latency: undefined,
    checkId: "local-eval",
    derivedFrom: health.id,
    source: "patient_health_with_local_overlay",
    raw: { patientHealth: health.raw },
  });
}
