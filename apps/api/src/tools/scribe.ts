import {
  SCENARIOS,
  matchRootCause,
  nowIso,
  type IncidentReport,
  type InvestigationRun,
  type RemediationAction,
} from "@gcp-sre/shared";
import { config } from "../config.js";
import { queueNotifyRunStatus } from "../paging/index.js";
import {
  appendEvent,
  releaseLock,
  saveRun,
  setReport,
  syncRunToFirestore,
  syncTraceToBigQuery,
  uploadEvidenceArtifact,
  uploadReportArtifact,
} from "../store/index.js";
import type { ToolCallContext } from "./types.js";

/** Orchestrator-supplied fields so Scribe cannot invent approval/cost. */
export interface ScribeToolArgs {
  decision: "approved" | "denied";
  executedActions?: RemediationAction[];
  healthAfter?: { ok: boolean; detail: string };
  cost: IncidentReport["cost"];
}

/** Fixed tool order until P2 ReAct selects tools. */
export const SCRIBE_TOOL_SEQUENCE = ["writeReport", "writeBigQueryTrace", "finalizeRun"] as const;

function requireScribeArgs(ctx: ToolCallContext): ScribeToolArgs {
  const args = ctx.args as Partial<ScribeToolArgs> | undefined;
  if (!args?.decision) {
    throw new Error("scribe tools require orchestrator-supplied decision");
  }
  if (!args.cost) {
    throw new Error("scribe tools require orchestrator-supplied cost");
  }
  return args as ScribeToolArgs;
}

/** Prefer agent-emitted canonical id; fall back to free-form label for older runs. */
function predictedRootCause(run: InvestigationRun): string {
  const top = run.hypotheses[0];
  if (!top) return "unknown";
  const canonical = top.canonicalRootCause?.trim();
  if (canonical) return canonical;
  return top.rootCauseLabel || "unknown";
}

/** Compose IncidentReport, persist it, and upload GCS artifacts when durable. */
export async function writeReport(ctx: ToolCallContext): Promise<unknown> {
  const { run } = ctx;
  const { decision, executedActions, healthAfter, cost } = requireScribeArgs(ctx);

  const predicted = predictedRootCause(run);
  const expected = run.scenario ? SCENARIOS[run.scenario].expectedRootCause : undefined;

  const report: IncidentReport = {
    runId: run.id,
    timeline: run.events.map((e) => ({ at: e.at, message: e.message, agent: e.agent })),
    evidence: run.evidence,
    hypotheses: run.hypotheses,
    ruledOut: run.ruledOut,
    proposedRemediation: run.proposedRemediation,
    approval: {
      decision,
      at: nowIso(),
      executedActions: decision === "approved" ? executedActions : undefined,
    },
    cost,
    healthAfter,
    expectedScenario: run.scenario,
    eval: expected ? { matched: matchRootCause(predicted, expected), expected, predicted } : undefined,
  };

  await setReport(run.id, report);
  run.report = report;

  if (config.useDurableStore) {
    try {
      run.reportGcsUri = await uploadReportArtifact(run.id, report);
      await uploadEvidenceArtifact(run.id, run.evidence);
    } catch (err) {
      console.error(`[gcs] report upload failed for ${run.id}:`, err);
    }
  }

  await saveRun(run);
  await syncRunToFirestore(run);

  return {
    ok: true,
    reportGcsUri: run.reportGcsUri ?? null,
    eval: report.eval ?? null,
  };
}

/** Insert the investigation analytics row (memory always; BigQuery in durable mode). */
export async function writeBigQueryTrace(ctx: ToolCallContext): Promise<unknown> {
  const { run } = ctx;
  const { decision } = requireScribeArgs(ctx);

  if (!run.report) {
    throw new Error("writeBigQueryTrace requires writeReport first");
  }

  const predicted = run.report.eval?.predicted ?? predictedRootCause(run);
  const expected = run.report.eval?.expected ?? null;
  const durationMs = Math.max(0, Date.parse(nowIso()) - Date.parse(run.createdAt));

  const traceRow = {
    runId: run.id,
    status: decision === "approved" ? "completed" : "denied",
    scenario: run.scenario ?? null,
    predicted,
    expected,
    costUsd: run.costUsd,
    tokensIn: run.tokensIn,
    tokensOut: run.tokensOut,
    project: config.projectId,
    targetService: run.targetService ?? run.patientService,
    rootCause: predicted,
    approvalDecision: decision,
    agentSteps: run.stepCount,
    toolCalls: run.toolCallCount,
    durationMs,
    reportGcsUri: run.reportGcsUri ?? null,
    region: run.region ?? config.region,
    eventsJson: JSON.stringify(run.events),
  };

  try {
    await syncTraceToBigQuery(traceRow);
  } catch (err) {
    run.status = "failed";
    run.error =
      err instanceof Error
        ? `BigQuery ingest failed: ${err.message}`
        : `BigQuery ingest failed: ${String(err)}`;
    await appendEvent(run.id, { agent: "scribe", type: "error", message: run.error });
    await saveRun(run);
    await syncRunToFirestore(run);
    queueNotifyRunStatus(run, "failed", run.error);
    throw err;
  }

  return { ok: true, runId: run.id, durationMs };
}

/** Transition to terminal status and release the investigation lease. */
export async function finalizeRun(ctx: ToolCallContext): Promise<unknown> {
  const { run } = ctx;
  const { decision } = requireScribeArgs(ctx);

  if (!run.report) {
    throw new Error("finalizeRun requires writeReport first");
  }

  run.status = decision === "approved" ? "completed" : "denied";
  await appendEvent(run.id, {
    agent: "scribe",
    type: "status",
    message: `Report finalized. eval=${run.report.eval ? `${run.report.eval.matched}` : "n/a"} cost=$${run.costUsd.toFixed(4)}${run.reportGcsUri ? ` gcs=${run.reportGcsUri}` : ""}`,
  });
  await saveRun(run);
  await syncRunToFirestore(run);
  await releaseLock(run.id);
  queueNotifyRunStatus(
    run,
    run.status === "completed" ? "completed" : "denied",
    decision === "approved" ? "Remediation approved and finalized." : "Remediation denied; report finalized.",
  );

  return {
    ok: true,
    status: run.status,
    reportGcsUri: run.reportGcsUri ?? null,
  };
}
