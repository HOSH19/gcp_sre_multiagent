import type { InvestigationRun } from "@gcp-sre/shared";
import { appendEvent } from "../store/index.js";
import { proposeRemediation } from "../tools/index.js";
import { inferHypotheses } from "./hypothesis.js";
import { llmStep, runTool } from "./runner.js";

export async function runDetector(run: InvestigationRun): Promise<void> {
  await llmStep(run, "detector", "You are Detector. Confirm patient health.", `Patient=${run.patientService}`, '{"role":"detector"}');
  await runTool(run, "detector", "getServiceHealth");
  await runTool(run, "detector", "listRecentErrors");
  await runTool(run, "detector", "getUptimeCheckState");
}

export async function runLogDiver(run: InvestigationRun): Promise<void> {
  await llmStep(run, "log_diver", "You are LogDiver. Collect evidence.", `n=${run.evidence.length}`, '{"role":"log_diver"}');
  for (const tool of ["queryLogs", "getErrorGroup", "listRevisions", "getRevisionTraffic", "getServiceEnv"]) {
    await runTool(run, "log_diver", tool);
  }
}

export async function runHypothesis(run: InvestigationRun): Promise<void> {
  const inferred = inferHypotheses(run);
  run.hypotheses = inferred.hypotheses;
  run.ruledOut = inferred.ruledOut;
  await llmStep(run, "hypothesis", "You are Hypothesis. Rank root causes.", JSON.stringify(inferred), JSON.stringify(inferred));
  appendEvent(run.id, {
    agent: "hypothesis",
    type: "status",
    message: `Top hypothesis: ${run.hypotheses[0]?.rootCauseLabel} (${run.hypotheses[0]?.confidence})`,
    data: inferred,
  });
}

export async function runMitigatorPropose(run: InvestigationRun): Promise<void> {
  await llmStep(run, "mitigator", "You are Mitigator. Propose allowlisted remediation.", JSON.stringify({ top: run.hypotheses[0] }), '{"propose":true}');
  run.proposedRemediation = proposeRemediation(run);
  run.toolCallCount += 1;
  appendEvent(run.id, {
    agent: "mitigator",
    type: "status",
    message: `Remediation proposed: ${run.proposedRemediation.summary}`,
    data: run.proposedRemediation,
  });
}
