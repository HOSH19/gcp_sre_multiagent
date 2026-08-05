import type { InvestigationRun } from "@gcp-sre/shared";
import { queueNotifyRunStatus } from "../paging/index.js";
import { appendEvent, getRun, releaseLock, saveRun } from "../store/index.js";
import { patchEnvVars, rollbackTraffic, verifyHealth } from "../tools/index.js";
import { assertCaps } from "./caps.js";
import { executableActionsFromProposal, isExecutableActionType } from "./policy.js";
import { finalizeWithScribe } from "./report.js";

async function executeActions(run: InvestigationRun): Promise<void> {
  const proposal = run.proposedRemediation;
  if (!proposal) throw new Error("no remediation proposal");

  const executable = executableActionsFromProposal(proposal);
  const skipped = proposal.actions.filter((a) => !isExecutableActionType(a.type));
  for (const action of skipped) {
    await appendEvent(run.id, {
      agent: "mitigator",
      type: "status",
      message: `Skipping non-executable (propose-only) action: ${action.type}`,
      data: action,
    });
  }

  if (!executable.length) {
    throw new Error("no allowlisted remediation actions to execute");
  }

  for (const action of executable) {
    run.toolCallCount += 1;
    assertCaps(run);
    if (action.type === "rollback_traffic") {
      const result = await rollbackTraffic();
      await appendEvent(run.id, { agent: "mitigator", type: "tool_result", message: "rollbackTraffic", data: result });
    } else if (action.type === "patch_env") {
      const result = await patchEnvVars(action.details);
      await appendEvent(run.id, { agent: "mitigator", type: "tool_result", message: "patchEnvVars", data: result });
    }
  }
}

async function executeApprovedRemediation(run: InvestigationRun): Promise<InvestigationRun> {
  await appendEvent(run.id, { agent: "mitigator", type: "status", message: "Approval granted — executing remediation" });
  await executeActions(run);
  const health = await verifyHealth();
  run.evidence.push(health);
  await appendEvent(run.id, { agent: "mitigator", type: "tool_result", message: "verifyHealth", data: health });
  const executed = executableActionsFromProposal(run.proposedRemediation);
  await finalizeWithScribe(run, "approved", executed);
  await releaseLock(run.id);
  return run;
}

/** Full sync path — used by eval harness. */
export async function resolveApproval(runId: string, decision: "approved" | "denied"): Promise<InvestigationRun> {
  const run = await getRun(runId);
  if (!run) throw new Error("run not found");
  if (run.status !== "awaiting_approval") throw new Error(`run is not awaiting approval (status=${run.status})`);

  if (decision === "denied") {
    run.status = "denied";
    await finalizeWithScribe(run, "denied");
    await releaseLock(runId);
    return run;
  }

  run.status = "remediating";
  await saveRun(run);
  return executeApprovedRemediation(run);
}

/**
 * Kick off approval work and return immediately (approve) so the UI can poll.
 * Deny still completes synchronously — it's fast.
 */
export async function queueApproval(runId: string, decision: "approved" | "denied"): Promise<InvestigationRun> {
  const run = await getRun(runId);
  if (!run) throw new Error("run not found");
  if (run.status !== "awaiting_approval") throw new Error(`run is not awaiting approval (status=${run.status})`);

  if (decision === "denied") {
    run.status = "denied";
    await saveRun(run);
    await releaseLock(runId);
    void finalizeWithScribe(run, "denied").catch((err) => console.error(`[deny] ${runId}:`, err));
    return run;
  }

  run.status = "remediating";
  await saveRun(run);
  void executeApprovedRemediation(run).catch(async (err) => {
    const current = await getRun(runId);
    if (current) {
      current.status = "failed";
      current.error = err instanceof Error ? err.message : String(err);
      await appendEvent(runId, { agent: "orchestrator", type: "error", message: current.error });
      await saveRun(current);
      await releaseLock(runId);
      queueNotifyRunStatus(current, "failed", current.error);
    }
    console.error(`[approve] ${runId}:`, err);
  });
  return run;
}
