import {
  SCENARIOS,
  type ScenarioId,
  type ServiceRegistryEntry,
} from "@gcp-sre/shared";
import { config } from "../config.js";
import type { AlertPayload, MonitoringIncident } from "./alertTypes.js";
import { findRegistryService, loadServiceRegistry } from "./registry.js";

export function pickScenario(
  payload: AlertPayload | null,
  attrs?: Record<string, string>,
): ScenarioId | undefined {
  const candidates = [
    attrs?.scenario,
    payload?.scenario,
    payload?.incident?.scenario,
  ].filter(Boolean) as string[];

  for (const raw of candidates) {
    if (raw in SCENARIOS) return raw as ScenarioId;
    const lower = raw.toLowerCase();
    if (lower.includes("revision") || lower.includes("traffic")) return "bad_revision_traffic";
    if (lower.includes("config") || lower.includes("missing") || lower.includes("env")) {
      return "missing_config";
    }
  }
  return undefined;
}

export function conditionLabel(incident?: MonitoringIncident): string | undefined {
  return (
    incident?.condition?.displayName ||
    incident?.condition_name ||
    incident?.conditionName ||
    incident?.condition?.name ||
    undefined
  );
}

export function hintsFromCondition(condition?: string, registryHints?: string[]): string[] {
  const hints = [...(registryHints ?? [])];
  if (!condition) return hints;
  const lower = condition.toLowerCase();
  if (lower.includes("uptime") || lower.includes("health")) {
    hints.push("Verify uptime check /health and recent 5xx in Cloud Logging");
  }
  if (lower.includes("latency") || lower.includes("p99")) {
    hints.push("Inspect revision traffic split and cold-start / concurrency limits");
  }
  if (lower.includes("error") || lower.includes("500")) {
    hints.push("Pull ERROR logs and error groups for the target service");
  }
  if (lower.includes("config") || lower.includes("env")) {
    hints.push("Compare service env vars against required keys (e.g. APP_SECRET)");
  }
  if (lower.includes("revision") || lower.includes("traffic")) {
    hints.push("Check revision traffic allocation and roll back unhealthy revision if approved");
  }
  return [...new Set(hints)];
}

export async function resolveService(opts: {
  payload: AlertPayload | null;
  attrs?: Record<string, string>;
}): Promise<ServiceRegistryEntry> {
  const incident = opts.payload?.incident ?? (opts.payload as MonitoringIncident | null);
  const labels = incident?.resource?.labels ?? {};

  const name =
    opts.attrs?.service ||
    opts.attrs?.targetService ||
    opts.payload?.targetService ||
    opts.payload?.service ||
    incident?.targetService ||
    incident?.service ||
    labels.service_name ||
    labels.service ||
    undefined;

  const projectId =
    opts.attrs?.projectId ||
    opts.payload?.projectId ||
    incident?.projectId ||
    labels.project_id ||
    config.projectId;

  const region =
    opts.attrs?.region ||
    opts.payload?.region ||
    incident?.region ||
    labels.location ||
    labels.region ||
    config.region;

  if (name) {
    const found = await findRegistryService({ name, projectId, region });
    if (found) return found;
    return { projectId, region, name };
  }

  const registry = await loadServiceRegistry();
  const haystack = [
    conditionLabel(incident ?? undefined),
    incident?.summary,
    incident?.resource_name,
    incident?.policy_name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (haystack) {
    const match = registry.services.find((s) => haystack.includes(s.name.toLowerCase()));
    if (match) return match;
  }

  const patient = await findRegistryService({
    name: config.patientServiceName,
    projectId: config.projectId,
    region: config.region,
  });
  return patient ?? { projectId: config.projectId, region: config.region, name: config.patientServiceName };
}
