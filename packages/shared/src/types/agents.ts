export type AgentName =
  | "orchestrator"
  | "detector"
  | "log_diver"
  | "hypothesis"
  | "mitigator"
  | "scribe";

export type RunStatus =
  | "queued"
  | "running"
  | "awaiting_approval"
  | "remediating"
  | "completed"
  | "failed"
  | "denied"
  | "cancelled";
