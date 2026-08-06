/** Orchestrator + specialist agent names. */
export type AgentName =
  | "orchestrator"
  | "detector"
  | "log_diver"
  | "hypothesis"
  | "mitigator"
  | "scribe";

/** Lifecycle status of an investigation run. */
export type RunStatus =
  | "queued"
  | "running"
  | "awaiting_approval"
  | "remediating"
  | "completed"
  | "failed"
  | "denied"
  | "cancelled";
