import type { InvestigationRun } from "@gcp-sre/shared";
import { config } from "../config.js";
import { appendEvent } from "../store/index.js";
import { inferHypotheses } from "./hypothesis.js";
import { runReactAgent } from "./react.js";
import { llmStep } from "./runner.js";

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
      "CRITICAL: Invoke tools via function calling (functionCall), never by naming them in prose.",
      "You may call read tools to gather more evidence if needed.",
      "You MUST finish by calling submitHypotheses with ranked hypotheses — do not only describe them in text.",
      "rootCauseLabel is a FREE-FORM human-readable string (not limited to a fixed enum).",
      "Also set canonicalRootCause when the cause maps to a known scenario: unhealthy_revision_receiving_traffic or missing_required_env.",
      "If none apply, omit canonicalRootCause or use a short free-form value.",
      "Prefer labels that match evidence; include confidence 0-1 and evidenceIds when known.",
      "After submitHypotheses you are done — do not call more tools.",
    ].join(" "),
    userPrompt: `Service=${run.targetService ?? run.patientService}\nEvidence:\n${JSON.stringify(evidenceBrief, null, 2)}\n\nCall submitHypotheses via function calling when ready.`,
    terminalTools: ["submitHypotheses"],
    maxTurns: 8,
    maxToollessTurns: 3,
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
