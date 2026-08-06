import type { ScenarioId } from "@gcp-sre/shared";

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
export type MonitoringIncident = {
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

export type AlertPayload = {
  scenario?: ScenarioId | string;
  service?: string;
  targetService?: string;
  projectId?: string;
  region?: string;
  playbookHints?: string[];
  incident?: MonitoringIncident;
  version?: string;
} & MonitoringIncident;
