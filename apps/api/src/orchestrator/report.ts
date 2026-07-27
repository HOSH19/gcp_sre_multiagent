import { SCENARIOS, nowIso, type IncidentReport, type InvestigationRun, type RemediationAction } from "@gcp-sre/shared";
import { config } from "../config.js";
import { appendEvent, appendTrace, saveRun, setReport, syncRunToFirestore, syncTraceToBigQuery } from "../store/index.js";
import { modelBreakdown } from "./cost.js";
import { healthAfterApprove } from "./healthCheck.js";
import { llmStep } from "./runner.js";

export async function finalizeWithScribe(
  run: InvestigationRun,
  decision: "approved" | "denied",
  executedActions?: RemediationAction[],
): Promise<void> {
  await llmStep(run, "scribe", "You are Scribe. Write the final report.", `run=${run.id}`, '{"writeReport":true}');

  const predicted = run.hypotheses[0]?.rootCauseLabel ?? "unknown";
  const expected = run.scenario ? SCENARIOS[run.scenario].expectedRootCause : undefined;
  const health = decision === "approved" ? await healthAfterApprove() : undefined;

  const report: IncidentReport = {
    runId: run.id,
    timeline: run.events.map((e) => ({ at: e.at, message: e.message, agent: e.agent })),
    evidence: run.evidence,
    hypotheses: run.hypotheses,
    ruledOut: run.ruledOut,
    proposedRemediation: run.proposedRemediation,
    approval: { decision, at: nowIso(), executedActions: decision === "approved" ? executedActions : undefined },
    cost: {
      totalUsd: run.costUsd,
      totalTokensIn: run.tokensIn,
      totalTokensOut: run.tokensOut,
      modelBreakdown: modelBreakdown(run),
    },
    healthAfter: health,
    expectedScenario: run.scenario,
    eval: expected ? { matched: predicted === expected, expected, predicted } : undefined,
  };

  run.toolCallCount += 3;
  setReport(run.id, report);
  run.status = decision === "approved" ? "completed" : "denied";

  const traceRow = {
    runId: run.id,
    status: run.status,
    scenario: run.scenario ?? null,
    predicted,
    expected: expected ?? null,
    costUsd: run.costUsd,
    tokensIn: run.tokensIn,
    tokensOut: run.tokensOut,
    project: config.projectId,
  };
  await syncTraceToBigQuery(traceRow);
  appendTrace(traceRow);
  appendEvent(run.id, {
    agent: "scribe",
    type: "status",
    message: `Report finalized. eval=${report.eval ? `${report.eval.matched}` : "n/a"} cost=$${run.costUsd.toFixed(4)}`,
  });
  saveRun(run);
  await syncRunToFirestore(run);
}
