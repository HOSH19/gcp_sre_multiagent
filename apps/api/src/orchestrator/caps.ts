import { RUN_CAPS, type InvestigationRun } from "@gcp-sre/shared";

export function assertCaps(run: InvestigationRun): void {
  if (run.stepCount >= RUN_CAPS.maxSteps) throw new Error("max steps exceeded");
  if (run.toolCallCount >= RUN_CAPS.maxToolCalls) throw new Error("max tool calls exceeded");
  if (run.costUsd >= RUN_CAPS.maxCostUsd) throw new Error("max cost exceeded");
  const elapsed = Date.now() - new Date(run.createdAt).getTime();
  if (elapsed >= RUN_CAPS.maxWallMs) throw new Error("max wall time exceeded");
}
