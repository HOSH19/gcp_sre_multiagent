import { getErrorGroup, getUptimeCheckState, listRecentErrors } from "./errors.js";
import { getServiceHealth, verifyHealth } from "./health.js";
import { getRevisionTraffic, getServiceEnv, listRevisions, queryLogs } from "./logs.js";

/** Read-only / no-arg tools invocable via the orchestrator tool runner. */
export const toolHandlers: Record<string, () => Promise<unknown>> = {
  getServiceHealth,
  listRecentErrors,
  getUptimeCheckState,
  queryLogs,
  getErrorGroup,
  listRevisions,
  getRevisionTraffic,
  getServiceEnv,
  verifyHealth,
};

export type ToolName = keyof typeof toolHandlers;

export { proposeRemediation, patchEnvVars, rollbackTraffic } from "./remediate.js";
export { getServiceHealth, verifyHealth } from "./health.js";
