import { MODEL_FLASH, MODEL_FLASH_LITE } from "./models.js";
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

/**
 * Mutation tools — only Mitigator after human approval.
 * Not included in AGENT_TOOLS so ReAct cannot call them pre-approval.
 */
export const AGENT_MUTATION_TOOLS = ["rollbackTraffic", "patchEnvVars", "verifyHealth"] as const;

export const AGENT_MODELS: Record<Specialist, string> = {
  detector: MODEL_FLASH_LITE,
  log_diver: MODEL_FLASH_LITE,
  hypothesis: MODEL_FLASH,
  mitigator: MODEL_FLASH,
  scribe: MODEL_FLASH_LITE,
};
