import { nowIso, type MappedAlert } from "@gcp-sre/shared";
import { config } from "../config.js";
import type { AlertPayload, MonitoringIncident, PubSubEnvelope } from "./alertTypes.js";
import {
  conditionLabel,
  hintsFromCondition,
  pickScenario,
  resolveService,
} from "./alertResolve.js";

export type { PubSubEnvelope } from "./alertTypes.js";

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
