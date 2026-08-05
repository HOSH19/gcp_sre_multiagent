import {
  SCENARIOS,
  nowIso,
  type MappedAlert,
  type ScenarioId,
  type ServiceRegistryEntry,
} from "@gcp-sre/shared";
import { config } from "../config.js";
import { findRegistryService, loadServiceRegistry } from "./registry.js";

export type PubSubEnvelope = {
  message?: {
    data?: string;
    attributes?: Record<string, string>;
    messageId?: string;
    publishTime?: string;
  };
  subscription?: string;
};

/** Loose Monitoring incident notification shape (Pub/Sub JSON). */
type MonitoringIncident = {
  incident_id?: string;
  incidentId?: string;
  state?: string;
  summary?: string;
  started_at?: number | string;
  ended_at?: number | string;
  url?: string;
  policy_name?: string;
  policyName?: string;
  condition_name?: string;
  conditionName?: string;
  condition?: { name?: string; displayName?: string };
  resource?: {
    type?: string;
    labels?: Record<string, string>;
  };
  resource_id?: string;
  resource_name?: string;
  resource_type_display_name?: string;
  metric?: { type?: string; displayName?: string };
  documentation?: { content?: string; mime_type?: string };
  scenario?: ScenarioId | string;
  service?: string;
  targetService?: string;
  projectId?: string;
  region?: string;
  playbookHints?: string[];
};

type AlertPayload = {
  scenario?: ScenarioId | string;
  service?: string;
  targetService?: string;
  projectId?: string;
  region?: string;
  playbookHints?: string[];
  incident?: MonitoringIncident;
  version?: string;
} & MonitoringIncident;

function decodeEnvelopeData(envelope: PubSubEnvelope | null): unknown {
  if (!envelope?.message?.data) return null;
  try {
    const text = Buffer.from(envelope.message.data, "base64").toString("utf8");
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickScenario(
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
    if (lower.includes("500") || lower.includes("http")) return "http_500s";
  }
  return undefined;
}

function conditionLabel(incident?: MonitoringIncident): string | undefined {
  return (
    incident?.condition?.displayName ||
    incident?.condition_name ||
    incident?.conditionName ||
    incident?.condition?.name ||
    undefined
  );
}

function hintsFromCondition(condition?: string, registryHints?: string[]): string[] {
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

async function resolveService(opts: {
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

/**
 * Map a Pub/Sub push envelope (or raw JSON body) into a structured alert.
 * Replaces string-heuristic scenario parsing for production alert ingestion.
 */
export async function mapAlertFromPubSub(
  envelope: PubSubEnvelope | null,
): Promise<MappedAlert> {
  const decoded = decodeEnvelopeData(envelope);
  const attrs = envelope?.message?.attributes;
  const record = asRecord(decoded) as AlertPayload | null;

  const incident: MonitoringIncident | undefined =
    record?.incident ??
    (record && (record.incident_id || record.incidentId || record.condition || record.resource)
      ? (record as MonitoringIncident)
      : undefined);

  const payload: AlertPayload | null = record
    ? { ...record, incident: incident ?? record.incident }
    : null;

  const service = await resolveService({ payload, attrs });
  const condition = conditionLabel(incident) ?? attrs?.condition;
  const scenario = pickScenario(payload, attrs);
  const playbookHints = hintsFromCondition(
    condition,
    [
      ...(service.playbookHints ?? []),
      ...((payload?.playbookHints ?? incident?.playbookHints ?? []) as string[]),
    ],
  );

  const chaosLab =
    service.chaosLab === true ||
    (service.name === config.patientServiceName &&
      service.projectId === config.projectId &&
      service.region === config.region);

  return {
    raw: decoded ?? { attributes: attrs ?? {}, empty: true },
    incidentId: incident?.incident_id ?? incident?.incidentId ?? attrs?.incident_id,
    state: incident?.state ?? attrs?.state,
    summary: incident?.summary ?? attrs?.summary,
    condition,
    policyName: incident?.policy_name ?? incident?.policyName ?? attrs?.policy_name,
    service: {
      name: service.name,
      projectId: service.projectId,
      region: service.region,
    },
    playbookHints: playbookHints.length ? playbookHints : undefined,
    scenario: chaosLab ? scenario : undefined,
    ingestedAt: nowIso(),
  };
}
