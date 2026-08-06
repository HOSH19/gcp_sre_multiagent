import type { AgentName } from "./types/agents.js";

/** Specialists that run ReAct / tool loops (excludes orchestrator). */
export type Specialist = Exclude<AgentName, "orchestrator">;

const DETECTOR_TOOLS = [
  "getServiceHealth",
  "listRecentErrors",
  "getUptimeCheckState",
  "listCloudRunServices",
] as const;

const LOG_DIVER_TOOLS = [
  "queryLogs",
  "getErrorGroup",
  "listRevisions",
  "getRevisionTraffic",
  "getServiceEnv",
] as const;

/** Read / propose tools each specialist may call during investigation. */
export const AGENT_TOOLS: Record<Specialist, string[]> = {
  detector: [...DETECTOR_TOOLS],
  log_diver: [...LOG_DIVER_TOOLS],
  hypothesis: [...DETECTOR_TOOLS, ...LOG_DIVER_TOOLS, "submitHypotheses"],
  mitigator: [...DETECTOR_TOOLS, ...LOG_DIVER_TOOLS, "proposeRemediation"],
  scribe: ["writeReport", "writeBigQueryTrace", "finalizeRun"],
};
