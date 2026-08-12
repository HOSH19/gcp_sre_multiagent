import type { InvestigationRun } from "@gcp-sre/shared";
import { queueNotifyRunStatus } from "../paging/index.js";
import { appendEvent, getRun, releaseLock, saveRun, tryTransitionRunStatus } from "../store/index.js";
import { healthEvidenceOk, patchEnvVars, rollbackTraffic, verifyHealth } from "../tools/index.js";
import { normalizeExecutableActions } from "./approvalNormalize.js";
import { assertCaps } from "./caps.js";
import { finalizeWithScribe } from "./report.js";

async function failRemediation(run: InvestigationRun, err: unknown): Promise<InvestigationRun> {
  const message = err instanceof Error ? err.message : String(err);
  run.status = "failed";
  run.error = message;
  await appendEvent(run.id, { agent: "orchestrator", type: "error", message });
  await saveRun(run);
  await releaseLock(run.id);
  queueNotifyRunStatus(run, "failed", message);
  return run;
}

async function runRemediationTool(
  run: InvestigationRun,
  tool: string,
  fn: () => Promise<unknown>,
): Promise<unknown> {
  const started = Date.now();
  await appendEvent(run.id, {
    agent: "mitigator",
    type: "tool_call",
    message: `Calling ${tool}`,
    data: { tool },
  });
  try {
    const result = await fn();
    await appendEvent(run.id, {
      agent: "mitigator",
      type: "tool_result",
      message: `Result from ${tool}`,
      data: { tool, durationMs: Date.now() - started, ok: true, result },
    });
    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await appendEvent(run.id, {
      agent: "mitigator",
      type: "tool_result",
      message: `Error from ${tool}`,
      data: { tool, durationMs: Date.now() - started, ok: false, error },
    });
    throw err;
  }
}

async function executeActions(run: InvestigationRun): Promise<ReturnType<typeof normalizeExecutableActions>["executable"]> {
  const { executable, skipped } = normalizeExecutableActions(run);
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
      await runRemediationTool(run, "rollbackTraffic", rollbackTraffic);
    } else if (action.type === "patch_env") {
      await runRemediationTool(run, "patchEnvVars", () => patchEnvVars(action.details));
    }
  }

  return executable;
}

async function executeApprovedRemediation(run: InvestigationRun): Promise<InvestigationRun> {
  try {
    await appendEvent(run.id, { agent: "mitigator", type: "status", message: "Approval granted — executing remediation" });
    const executed = await executeActions(run);
    const health = await runRemediationTool(run, "verifyHealth", verifyHealth);
    run.evidence.push(health as InvestigationRun["evidence"][number]);
    await finalizeWithScribe(run, "approved", executed, healthEvidenceOk(health));
    await releaseLock(run.id);
    return run;
  } catch (err) {
    return failRemediation(run, err);
  }
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

  if (!(await tryTransitionRunStatus(runId, "awaiting_approval", "remediating"))) {
    const current = await getRun(runId);
    throw new Error(`run is not awaiting approval (status=${current?.status ?? "missing"})`);
  }
  const remediating = (await getRun(runId))!;
  return executeApprovedRemediation(remediating);
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
    if (!(await tryTransitionRunStatus(runId, "awaiting_approval", "denied"))) {
      const current = await getRun(runId);
      throw new Error(`run is not awaiting approval (status=${current?.status ?? "missing"})`);
    }
    const denied = (await getRun(runId))!;
    await releaseLock(runId);
    void finalizeWithScribe(denied, "denied").catch((err) => console.error(`[deny] ${runId}:`, err));
    return denied;
  }

  if (!(await tryTransitionRunStatus(runId, "awaiting_approval", "remediating"))) {
    const current = await getRun(runId);
    throw new Error(`run is not awaiting approval (status=${current?.status ?? "missing"})`);
  }
  const remediating = (await getRun(runId))!;
  void executeApprovedRemediation(remediating).catch((err) => {
    console.error(`[approve] unhandled ${runId}:`, err);
  });
  return remediating;
}
