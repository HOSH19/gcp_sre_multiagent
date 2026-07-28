import type { InvestigationRun } from "@gcp-sre/shared";
import { appendEvent } from "../store/index.js";
import { proposeRemediation } from "../tools/index.js";
import { inferHypotheses } from "./hypothesis.js";
import { llmStep, runTool } from "./runner.js";

export async function runDetector(run: InvestigationRun): Promise<void> {
  await llmStep(
    run,
    "detector",
    "You are Detector, an SRE agent. The demo Cloud Run service is nicknamed 'patient' (not a medical patient). In 1-2 sentences, say you will check health, recent errors, and uptime. Do not ask the user questions.",
    `Service=${run.patientService}`,
    "I will verify Cloud Run patient health, recent errors, and uptime check state.",
  );
  await runTool(run, "detector", "getServiceHealth");
  await runTool(run, "detector", "listRecentErrors");
  await runTool(run, "detector", "getUptimeCheckState");
}

export async function runLogDiver(run: InvestigationRun): Promise<void> {
  await llmStep(
    run,
    "log_diver",
    "You are LogDiver, an SRE agent. In 1-2 sentences, say which signals you will pull (logs, error groups, revisions, traffic, env).",
    `Evidence so far: ${run.evidence.length} items`,
    "I will collect logs, error groups, revisions, traffic split, and env config.",
  );
  for (const tool of ["queryLogs", "getErrorGroup", "listRevisions", "getRevisionTraffic", "getServiceEnv"]) {
    await runTool(run, "log_diver", tool);
  }
}

export async function runHypothesis(run: InvestigationRun): Promise<void> {
  const inferred = inferHypotheses(run);
  run.hypotheses = inferred.hypotheses;
  run.ruledOut = inferred.ruledOut;
  await llmStep(
    run,
    "hypothesis",
    "You are Hypothesis for a Cloud Run incident. Write 2-4 short sentences naming the top root cause and why. Do not reply with JSON only.",
    `Evidence-backed ranking:\n${JSON.stringify(inferred, null, 2)}`,
    `Top root cause is ${inferred.hypotheses[0]?.rootCauseLabel ?? "unknown"} based on the collected evidence.`,
  );
  appendEvent(run.id, {
    agent: "hypothesis",
    type: "status",
    message: `Top hypothesis: ${run.hypotheses[0]?.rootCauseLabel} (${run.hypotheses[0]?.confidence})`,
    data: inferred,
  });
}

export async function runMitigatorPropose(run: InvestigationRun): Promise<void> {
  // Build the real proposal first so the timeline status/summary is authoritative.
  run.proposedRemediation = proposeRemediation(run);
  run.toolCallCount += 1;

  await llmStep(
    run,
    "mitigator",
    "You are Mitigator. In 2 short sentences, restate the allowlisted remediation and why it is safe. No markdown headings or long reports.",
    `Proposal:\n${JSON.stringify(run.proposedRemediation, null, 2)}`,
    `Propose: ${run.proposedRemediation.summary}`,
  );

  appendEvent(run.id, {
    agent: "mitigator",
    type: "status",
    message: `Remediation proposed: ${run.proposedRemediation.summary}`,
    data: run.proposedRemediation,
  });
}
