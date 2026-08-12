/** Pager / notification policy (PagerDuty Events API v2). */
interface PagerPolicy {
  /** Optional per-service PagerDuty Events API v2 routing key (overrides PAGERDUTY_ROUTING_KEY). */
  pagerDutyServiceKey?: string;
  /** Default severity hint for PagerDuty triggers. */
  severity?: "info" | "warning" | "error" | "critical";
}

/** One in-scope Cloud Run service for fleet investigations. */
export interface ServiceRegistryEntry {
  /** GCP project id. */
  projectId: string;
  /** Cloud Run region. */
  region: string;
  /** Cloud Run service name. */
  name: string;
  /** Owning team / human contact. */
  owner?: string;
  /** Optional Cloud Monitoring uptime check id (short or full resource name). */
  uptimeCheckId?: string;
  /** When true, this entry is the chaos-lab patient (demo inject allowed). */
  chaosLab?: boolean;
  /** PagerDuty policy for approval + terminal notifications. */
  pagerPolicy?: PagerPolicy;
  /** Optional playbook / investigation hints for alert correlation. */
  playbookHints?: string[];
}

/** Top-level fleet registry document (config JSON or Firestore). */
export interface ServiceRegistry {
  version?: number;
  updatedAt?: string;
  services: ServiceRegistryEntry[];
}

/**
 * Structured alert after mapping a Monitoring / Pub/Sub payload.
 * Persisted on InvestigationRun.alert when trigger=alert.
 */
export interface MappedAlert {
  /** Raw decoded Pub/Sub / webhook payload (truncated by caller if huge). */
  raw: unknown;
  /** Monitoring incident id when present. */
  incidentId?: string;
  /** Alert state (open / closed / …). */
  state?: string;
  /** Human summary from the incident. */
  summary?: string;
  /** Condition display name or id. */
  condition?: string;
  /** Alerting policy name when present. */
  policyName?: string;
  /** Resolved target from registry (or inferred labels). */
  service: {
    name: string;
    projectId: string;
    region: string;
  };
  /** Optional playbook hints (registry + condition heuristics). */
  playbookHints?: string[];
  /** Demo / eval scenario id when the payload explicitly requests one. */
  scenario?: string;
  /** ISO timestamp when the alert was ingested. */
  ingestedAt: string;
}
