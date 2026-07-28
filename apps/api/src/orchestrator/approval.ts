import type { InvestigationRun } from "@gcp-sre/shared";
import { appendEvent, getRun, releaseLock, saveRun } from "../store/index.js";
import { patchEnvVars, rollbackTraffic, verifyHealth } from "../tools/index.js";
import { assertCaps } from "./caps.js";
import { finalizeWithScribe } from "./report.js";

async function executeActions(run: InvestigationRun): Promise<void> {
  const proposal = run.proposedRemediation;
  if (!proposal) throw new Error("no remediation proposal");
  for (const action of proposal.actions) {
    run.toolCallCount += 1;
    assertCaps(run);
    if (action.type === "rollback_traffic") {
      const result = await rollbackTraffic();
      appendEvent(run.id, { agent: "mitigator", type: "tool_result", message: "rollbackTraffic", data: result });
    } else {
      const result = await patchEnvVars(action.details);
      appendEvent(run.id, { agent: "mitigator", type: "tool_result", message: "patchEnvVars", data: result });
    }
  }
}

async function executeApprovedRemediation(run: InvestigationRun): Promise<InvestigationRun> {
  appendEvent(run.id, { agent: "mitigator", type: "status", message: "Approval granted — executing remediation" });
  await executeActions(run);
  const health = await verifyHealth();
  run.evidence.push(health);
  appendEvent(run.id, { agent: "mitigator", type: "tool_result", message: "verifyHealth", data: health });
  await finalizeWithScribe(run, "approved", run.proposedRemediation?.actions);
  releaseLock(run.id);
  return run;
}

/** Full sync path — used by eval harness. */
export async function resolveApproval(runId: string, decision: "approved" | "denied"): Promise<InvestigationRun> {
  const run = getRun(runId);
  if (!run) throw new Error("run not found");
  if (run.status !== "awaiting_approval") throw new Error(`run is not awaiting approval (status=${run.status})`);

  if (decision === "denied") {
    run.status = "denied";
    await finalizeWithScribe(run, "denied");
    releaseLock(runId);
    return run;
  }

  run.status = "remediating";
  saveRun(run);
  return executeApprovedRemediation(run);
}

/**
 * Kick off approval work and return immediately (approve) so the UI can poll.
 * Deny still completes synchronously — it's fast.
 */
export function queueApproval(runId: string, decision: "approved" | "denied"): InvestigationRun {
  const run = getRun(runId);
  if (!run) throw new Error("run not found");
  if (run.status !== "awaiting_approval") throw new Error(`run is not awaiting approval (status=${run.status})`);

  if (decision === "denied") {
    run.status = "denied";
    saveRun(run);
    void finalizeWithScribe(run, "denied")
      .then(() => releaseLock(runId))
      .catch((err) => console.error(`[deny] ${runId}:`, err));
    return run;
  }

  run.status = "remediating";
  saveRun(run);
  void executeApprovedRemediation(run).catch((err) => {
    const current = getRun(runId);
    if (current) {
      current.status = "failed";
      current.error = err instanceof Error ? err.message : String(err);
      appendEvent(runId, { agent: "orchestrator", type: "error", message: current.error });
      saveRun(current);
      releaseLock(runId);
    }
    console.error(`[approve] ${runId}:`, err);
  });
  return run;
}
