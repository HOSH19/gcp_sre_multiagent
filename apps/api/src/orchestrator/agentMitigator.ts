import type { InvestigationRun } from "@gcp-sre/shared";
import { config } from "../config.js";
import { appendEvent } from "../store/index.js";
import { ensureRemediationProposal, proposeRemediation } from "../tools/index.js";
import { runReactAgent } from "./react.js";
import { llmStep } from "./runner.js";

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
  try {
    await runReactAgent({
      run,
      agent: "mitigator",
      system: [
        "You are Mitigator. Propose remediation for human approval — do NOT execute mutations.",
        "CRITICAL: Invoke tools via function calling (functionCall), never by naming them in prose.",
        "You MUST call proposeRemediation with summary, risk, and actions — do not only describe the plan in text.",
        "Prefer allowlisted action types: rollback_traffic, patch_env.",
        "For patch_env, details must be a literal env-var map such as {\"APP_SECRET\":\"restore-known-good\"}; do not emit meta keys like environment_variable or action_type.",
        "Unknown action types may be proposed for visibility but will never execute.",
        "You may call read tools if you need more context. After proposeRemediation you are done.",
      ].join(" "),
      userPrompt: [
        `Service=${run.targetService ?? run.patientService}`,
        `Top hypotheses:\n${JSON.stringify(run.hypotheses.slice(0, 3), null, 2)}`,
        `Evidence count=${run.evidence.length}`,
        "Call proposeRemediation via function calling now.",
      ].join("\n"),
      terminalTools: ["proposeRemediation"],
      maxTurns: 6,
      maxToollessTurns: 3,
      mockFinalText: "Proposing allowlisted remediation.",
    });
  } catch (err) {
    ensureRemediationProposal(run);
    await appendEvent(run.id, {
      agent: "mitigator",
      type: "status",
      message: `ReAct failed (${err instanceof Error ? err.message : String(err)}) — using deterministic fallback`,
      data: run.proposedRemediation,
    });
    return;
  }

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
