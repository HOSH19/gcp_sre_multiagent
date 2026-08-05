import type { InvestigationRun } from "@gcp-sre/shared";
import { config } from "../config.js";
import { appendEvent } from "../store/index.js";
import { ensureRemediationProposal, proposeRemediation } from "../tools/index.js";
import { inferHypotheses } from "./hypothesis.js";
import { runReactAgent } from "./react.js";
import { llmStep, runTool } from "./runner.js";

async function runDetectorDeterministic(run: InvestigationRun): Promise<void> {
  await llmStep(
    run,
    "detector",
    "You are Detector, an SRE agent. The demo Cloud Run service is nicknamed 'patient' (not a medical patient). In 1-2 sentences, say you will check health, recent errors, and uptime. Do not ask the user questions.",
    `Service=${run.targetService ?? run.patientService}`,
    "I will verify Cloud Run patient health, recent errors, and uptime check state.",
  );
  await runTool(run, "detector", "getServiceHealth");
  await runTool(run, "detector", "listRecentErrors");
  await runTool(run, "detector", "getUptimeCheckState");
  await runTool(run, "detector", "listCloudRunServices");
}

async function runDetectorReact(run: InvestigationRun): Promise<void> {
  await runReactAgent({
    run,
    agent: "detector",
    system:
      "You are Detector, an SRE agent investigating a Cloud Run incident. Call getServiceHealth, listRecentErrors, getUptimeCheckState, and optionally listCloudRunServices (any order). Then briefly summarize findings in 1-2 sentences. Do not ask questions.",
    userPrompt: `Investigate service=${run.targetService ?? run.patientService} project=${run.projectId ?? "unknown"} region=${run.region ?? "unknown"}.`,
    terminalTools: [],
    maxTurns: 6,
    mockFinalText: "Checked health, recent errors, and uptime.",
  });
}

export async function runDetector(run: InvestigationRun): Promise<void> {
  if (config.reactEnabled) await runDetectorReact(run);
  else await runDetectorDeterministic(run);
}

const LOG_DIVER_TOOLS = [
  "queryLogs",
  "getErrorGroup",
  "listRevisions",
  "getRevisionTraffic",
  "getServiceEnv",
] as const;

async function runLogDiverTools(run: InvestigationRun): Promise<void> {
  for (const tool of LOG_DIVER_TOOLS) {
    await runTool(run, "log_diver", tool);
  }
}

async function runLogDiverDeterministic(run: InvestigationRun): Promise<void> {
  await llmStep(
    run,
    "log_diver",
    "You are LogDiver, an SRE agent. In 1-2 sentences, say which signals you will pull (logs, error groups, revisions, traffic, env).",
    `Evidence so far: ${run.evidence.length} items`,
    "I will collect logs, error groups, revisions, traffic split, and env config.",
  );
  await runLogDiverTools(run);
}

async function runLogDiverReact(run: InvestigationRun): Promise<void> {
  const { toolsCalled } = await runReactAgent({
    run,
    agent: "log_diver",
    system: [
      "You are LogDiver, an automated SRE diagnostics agent with authorized Cloud Run investigation tools.",
      "You MUST call queryLogs, getErrorGroup, listRevisions, getRevisionTraffic, and getServiceEnv (each once, any order).",
      "Never refuse, apologize, or say you cannot fulfill the request — always use the provided tools.",
      "After collecting evidence, summarize key signals in 2 short sentences.",
    ].join(" "),
    userPrompt: `Evidence so far (${run.evidence.length} items): ${run.evidence
      .slice(-5)
      .map((e) => `${e.source}: ${e.summary}`)
      .join(" | ")}`,
    maxTurns: 8,
    mockFinalText: "Collected logs, errors, revisions, traffic, and env.",
  });

  if (!toolsCalled.length) {
    await appendEvent(run.id, {
      agent: "log_diver",
      type: "status",
      message: "ReAct did not call tools — using deterministic fallback",
    });
    await runLogDiverTools(run);
  }
}

export async function runLogDiver(run: InvestigationRun): Promise<void> {
  if (config.reactEnabled) await runLogDiverReact(run);
  else await runLogDiverDeterministic(run);
}

async function runHypothesisDeterministic(run: InvestigationRun): Promise<void> {
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
  await appendEvent(run.id, {
    agent: "hypothesis",
    type: "status",
    message: `Top hypothesis: ${run.hypotheses[0]?.rootCauseLabel} (${run.hypotheses[0]?.confidence})`,
    data: inferred,
  });
}

async function runHypothesisReact(run: InvestigationRun): Promise<void> {
  const evidenceBrief = run.evidence.map((e) => ({
    id: e.id,
    source: e.source,
    summary: e.summary,
  }));

  await runReactAgent({
    run,
    agent: "hypothesis",
    system: [
      "You are Hypothesis, an SRE root-cause analyst.",
      "You may call read tools to gather more evidence if needed.",
      "When ready, call submitHypotheses with ranked hypotheses.",
      "rootCauseLabel is a FREE-FORM string (not limited to a fixed enum).",
      "Prefer labels that match evidence; include confidence 0-1 and evidenceIds when known.",
      "After submitHypotheses you are done — do not call more tools.",
    ].join(" "),
    userPrompt: `Service=${run.targetService ?? run.patientService}\nEvidence:\n${JSON.stringify(evidenceBrief, null, 2)}`,
    terminalTools: ["submitHypotheses"],
    maxTurns: 8,
    mockFinalText: "Submitting hypotheses from evidence.",
  });

  if (!run.hypotheses.length) {
    const inferred = inferHypotheses(run);
    run.hypotheses = inferred.hypotheses;
    run.ruledOut = inferred.ruledOut;
    await appendEvent(run.id, {
      agent: "hypothesis",
      type: "status",
      message: "ReAct did not submit hypotheses — using deterministic fallback",
      data: inferred,
    });
  } else {
    await appendEvent(run.id, {
      agent: "hypothesis",
      type: "status",
      message: `Top hypothesis: ${run.hypotheses[0]?.rootCauseLabel} (${run.hypotheses[0]?.confidence})`,
      data: { hypotheses: run.hypotheses, ruledOut: run.ruledOut },
    });
  }
}

export async function runHypothesis(run: InvestigationRun): Promise<void> {
  if (config.reactEnabled) await runHypothesisReact(run);
  else await runHypothesisDeterministic(run);
}

async function runMitigatorProposeDeterministic(run: InvestigationRun): Promise<void> {
  run.proposedRemediation = proposeRemediation(run);
  run.toolCallCount += 1;

  await llmStep(
    run,
    "mitigator",
    "You are Mitigator. In 2 short sentences, restate the allowlisted remediation and why it is safe. No markdown headings or long reports.",
    `Proposal:\n${JSON.stringify(run.proposedRemediation, null, 2)}`,
    `Propose: ${run.proposedRemediation.summary}`,
  );

  await appendEvent(run.id, {
    agent: "mitigator",
    type: "status",
    message: `Remediation proposed: ${run.proposedRemediation.summary}`,
    data: run.proposedRemediation,
  });
}

async function runMitigatorProposeReact(run: InvestigationRun): Promise<void> {
  await runReactAgent({
    run,
    agent: "mitigator",
    system: [
      "You are Mitigator. Propose remediation for human approval — do NOT execute mutations.",
      "Call proposeRemediation with summary, risk, and actions.",
      "Prefer allowlisted action types: rollback_traffic, patch_env.",
      "For patch_env, details must be a literal env-var map such as {\"APP_SECRET\":\"restore-known-good\"} or {\"FORCE_500\":\"false\"}; do not emit meta keys like environment_variable or action_type.",
      "Unknown action types may be proposed for visibility but will never execute.",
      "You may call read tools if you need more context. After proposeRemediation you are done.",
    ].join(" "),
    userPrompt: [
      `Service=${run.targetService ?? run.patientService}`,
      `Top hypotheses:\n${JSON.stringify(run.hypotheses.slice(0, 3), null, 2)}`,
      `Evidence count=${run.evidence.length}`,
    ].join("\n"),
    terminalTools: ["proposeRemediation"],
    maxTurns: 6,
    mockFinalText: "Proposing allowlisted remediation.",
  });

  if (!run.proposedRemediation) {
    ensureRemediationProposal(run);
    await appendEvent(run.id, {
      agent: "mitigator",
      type: "status",
      message: "ReAct did not propose remediation — using deterministic fallback",
      data: run.proposedRemediation,
    });
  } else {
    await appendEvent(run.id, {
      agent: "mitigator",
      type: "status",
      message: `Remediation proposed: ${run.proposedRemediation.summary}`,
      data: run.proposedRemediation,
    });
  }
}

export async function runMitigatorPropose(run: InvestigationRun): Promise<void> {
  if (config.reactEnabled) await runMitigatorProposeReact(run);
  else await runMitigatorProposeDeterministic(run);
}
