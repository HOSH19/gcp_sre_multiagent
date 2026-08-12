import type { InvestigationRun, RunStatus, ServiceRegistryEntry } from "@gcp-sre/shared";

/** Statuses that trigger outbound paging notifications. */
export type NotifyStatus = Extract<
  RunStatus,
  "awaiting_approval" | "completed" | "denied" | "failed"
>;

export interface NotifyContext {
  run: InvestigationRun;
  status: NotifyStatus;
  /** Human-readable reason (e.g. paused for approval, remediation denied). */
  summary?: string;
  registryEntry?: ServiceRegistryEntry;
}

export interface NotifyResult {
  pagerDuty: "sent" | "skipped" | "failed" | "noop";
  detail?: string;
}
