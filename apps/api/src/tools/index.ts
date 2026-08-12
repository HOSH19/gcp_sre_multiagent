import { getErrorGroup, getUptimeCheckState, listRecentErrors } from "./errors.js";
import { listCloudRunServices } from "./fleet.js";
import { getServiceHealth } from "./health.js";
import { getRevisionTraffic, getServiceEnv, listRevisions, queryLogs } from "./logs.js";
import {
  patchEnvVarsTool,
  proposeRemediationTool,
  rollbackTrafficTool,
  submitHypotheses,
  verifyHealthTool,
} from "./reactTools.js";
import { finalizeRun, writeBigQueryTrace, writeReport } from "./scribe.js";
import type { ToolHandler } from "./types.js";

/** Read / write tools invocable via the orchestrator tool runner (including Scribe). */
export const toolHandlers: Record<string, ToolHandler> = {
  getServiceHealth: async () => getServiceHealth(),
  listRecentErrors: async (ctx) => listRecentErrors(ctx),
  getUptimeCheckState: async (ctx) => getUptimeCheckState(ctx),
  queryLogs: async (ctx) => queryLogs(ctx),
  getErrorGroup: async (ctx) => getErrorGroup(ctx),
  listRevisions: async (ctx) => listRevisions(ctx),
  getRevisionTraffic: async (ctx) => getRevisionTraffic(ctx),
  getServiceEnv: async (ctx) => getServiceEnv(ctx),
  listCloudRunServices: async (ctx) => listCloudRunServices(ctx),
  verifyHealth: verifyHealthTool,
  submitHypotheses,
  proposeRemediation: proposeRemediationTool,
  rollbackTraffic: rollbackTrafficTool,
  patchEnvVars: patchEnvVarsTool,
  writeReport,
  writeBigQueryTrace,
  finalizeRun,
};

export type ToolName = keyof typeof toolHandlers;

export { proposeRemediation, patchEnvVars, rollbackTraffic } from "./remediate.js";
export { verifyHealth, healthEvidenceOk, isPostRemediationHealthy } from "./health.js";
export {
  SCRIBE_TOOL_SEQUENCE,
  writeReport,
  writeBigQueryTrace,
  finalizeRun,
  type ScribeToolArgs,
} from "./scribe.js";
export { ensureRemediationProposal } from "./reactTools.js";
export { toolDeclarations } from "./schemas.js";
