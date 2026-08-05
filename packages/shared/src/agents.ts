import type { AgentName } from "./types/agents.js";

export type Specialist = Exclude<AgentName, "orchestrator">;

/** Read / propose tools each specialist may call during investigation. */
export const AGENT_TOOLS: Record<Specialist, string[]> = {
  detector: [
    "getServiceHealth",
    "listRecentErrors",
    "getUptimeCheckState",
    "listCloudRunServices",
  ],
  log_diver: ["queryLogs", "getErrorGroup", "listRevisions", "getRevisionTraffic", "getServiceEnv"],
  hypothesis: [
    "getServiceHealth",
    "listRecentErrors",
    "getUptimeCheckState",
    "listCloudRunServices",
    "queryLogs",
    "getErrorGroup",
    "listRevisions",
    "getRevisionTraffic",
    "getServiceEnv",
    "submitHypotheses",
  ],
  mitigator: [
    "getServiceHealth",
    "listRecentErrors",
    "getUptimeCheckState",
    "listCloudRunServices",
    "queryLogs",
    "getErrorGroup",
    "listRevisions",
    "getRevisionTraffic",
    "getServiceEnv",
    "proposeRemediation",
  ],
  scribe: ["writeReport", "writeBigQueryTrace", "finalizeRun"],
};
