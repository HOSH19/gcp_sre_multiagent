import { MODEL_FLASH, MODEL_FLASH_LITE } from "./models.js";
import type { AgentName } from "./types/agents.js";

export type Specialist = Exclude<AgentName, "orchestrator">;

export const AGENT_TOOLS: Record<Specialist, string[]> = {
  detector: ["getServiceHealth", "listRecentErrors", "getUptimeCheckState"],
  log_diver: ["queryLogs", "getErrorGroup", "listRevisions", "getRevisionTraffic", "getServiceEnv"],
  hypothesis: [],
  mitigator: ["proposeRemediation", "rollbackTraffic", "patchEnvVars", "verifyHealth"],
  scribe: ["writeReport", "writeBigQueryTrace", "finalizeRun"],
};

export const AGENT_MODELS: Record<Specialist, string> = {
  detector: MODEL_FLASH_LITE,
  log_diver: MODEL_FLASH_LITE,
  hypothesis: MODEL_FLASH,
  mitigator: MODEL_FLASH,
  scribe: MODEL_FLASH_LITE,
};
