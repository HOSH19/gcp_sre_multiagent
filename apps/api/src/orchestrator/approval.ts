import type { InvestigationRun } from "@gcp-sre/shared";
import { queueNotifyRunStatus } from "../paging/index.js";
import { appendEvent, getRun, releaseLock, saveRun } from "../store/index.js";
import { patchEnvVars, rollbackTraffic, verifyHealth } from "../tools/index.js";
import { proposeRemediation as deterministicProposal } from "../tools/remediate.js";
import { assertCaps } from "./caps.js";
import { executableActionsFromProposal, isExecutableActionType } from "./policy.js";
import { finalizeWithScribe } from "./report.js";

function approvedHealthSummary(health: unknown): { ok: boolean; detail: string } {
  const patientOk = Boolean((health as { raw?: { patient?: { ok?: boolean } }; summary?: string })?.raw?.patient?.ok);
  const detail = (health as { summary?: string })?.summary ?? "Post-remediation health unknown";
  return { ok: patientOk, detail };
}

function normalizeExecutableActions(run: InvestigationRun) {
  const proposal = run.proposedRemediation;
  if (!proposal) throw new Error("no remediation proposal");

  let executable = executableActionsFromProposal(proposal);
  const skipped = proposal.actions.filter((a) => !isExecutableActionType(a.type));
  const fallback = executableActionsFromProposal(deterministicProposal(run));
  const fallbackByType = new Map(fallback.map((action) => [action.type, action]));

  if (run.scenario === "http_500s") {
    if (executable.length === 0) {
      const hasForce500Disabled = fallback.some(
        (a) => a.type === "patch_env" && a.details.FORCE_500 === "false",
      );

      executable = hasForce500Disabled
        ? fallback
        : [
            ...fallback,
            { type: "patch_env", reason: "Disable force-500 chaos", details: { FORCE_500: "false" } },
          ];
    }

    const hasForce500DisabledInExecutable = executable.some(
      (a) => a.type === "patch_env" && a.details.FORCE_500 === "false",
    );

    if (!hasForce500DisabledInExecutable) {
      const hasPatchEnv = executable.some((a) => a.type === "patch_env");
      executable = hasPatchEnv
        ? executable.map((a) => (a.type === "patch_env" ? { ...a, details: { ...a.details, FORCE_500: "false" } } : a))
        : [
            ...executable,
            { type: "patch_env", reason: "Disable force-500 chaos", details: { FORCE_500: "false" } },
          ];
    }
  }

  const normalized = executable.map((action) => {
    if (action.type !== "patch_env") return action;

    const fallbackAction = fallbackByType.get(action.type);
    const fallbackDetails = fallbackAction?.details ?? {};
    const malformedAlias = action.details.environment_variable;
    const hasForce500False = run.scenario === "http_500s" && action.details.FORCE_500 === "false";
    const needsCanonicalPatch =
      !Object.keys(action.details).length ||
      Boolean(malformedAlias) ||
      "action_type" in action.details ||
      (!hasForce500False &&
        run.hypotheses[0]?.rootCauseLabel === "missing_required_env" &&
        !("APP_SECRET" in action.details));

    if (!needsCanonicalPatch) return action;

    return {
      ...action,
      details: { ...fallbackDetails },
    };
  });

  return { executable: normalized, skipped };
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
      const result = await rollbackTraffic();
      await appendEvent(run.id, { agent: "mitigator", type: "tool_result", message: "rollbackTraffic", data: result });
    } else if (action.type === "patch_env") {
      const result = await patchEnvVars(action.details);
      await appendEvent(run.id, { agent: "mitigator", type: "tool_result", message: "patchEnvVars", data: result });
    }
  }

  return executable;
}

async function executeApprovedRemediation(run: InvestigationRun): Promise<InvestigationRun> {
  await appendEvent(run.id, { agent: "mitigator", type: "status", message: "Approval granted — executing remediation" });
  const executed = await executeActions(run);
  const health = await verifyHealth();
  run.evidence.push(health);
  await appendEvent(run.id, { agent: "mitigator", type: "tool_result", message: "verifyHealth", data: health });
  await finalizeWithScribe(run, "approved", executed, approvedHealthSummary(health));
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
