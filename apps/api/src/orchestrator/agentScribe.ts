import type { InvestigationRun, RemediationAction } from "@gcp-sre/shared";
import { config } from "../config.js";
import { SCRIBE_TOOL_SEQUENCE, type ScribeToolArgs } from "../tools/index.js";
import { appendEvent } from "../store/index.js";
import { runReactAgent } from "./react.js";
import { runTool } from "./runner.js";

/**
 * Invoke any Scribe tools the ReAct loop did not reach, in mandatory order.
 */
async function runScribeFallback(
  run: InvestigationRun,
  args: ScribeToolArgs,
  toolsCalled: string[],
): Promise<void> {
  const payload = args as unknown as Record<string, unknown>;
  const missing = SCRIBE_TOOL_SEQUENCE.filter((tool) => !toolsCalled.includes(tool));
  if (!missing.length) return;

  await appendEvent(run.id, {
    agent: "scribe",
    type: "status",
    message: `ReAct incomplete — running deterministic fallback for: ${missing.join(", ")}`,
    data: { toolsCalled, missing },
  });

  for (const tool of missing) {
    await runTool(run, "scribe", tool, payload);
  }
}

async function runScribeDeterministic(run: InvestigationRun, args: ScribeToolArgs): Promise<void> {
  const payload = args as unknown as Record<string, unknown>;
  for (const tool of SCRIBE_TOOL_SEQUENCE) {
    await runTool(run, "scribe", tool, payload);
  }
}

async function runScribeReact(
  run: InvestigationRun,
  args: ScribeToolArgs,
  decision: "approved" | "denied",
  executedActions?: RemediationAction[],
  healthAfter?: { ok: boolean; detail: string },
): Promise<void> {
  const { toolsCalled } = await runReactAgent({
    run,
    agent: "scribe",
    system: [
      "You are Scribe, the incident report writer for a Cloud Run investigation.",
      "CRITICAL: Invoke tools via function calling (functionCall), never by naming them in prose or pseudo-code.",
      "Do not write Python, JSON tool plans, or invented run/decision/cost/hypothesis fields.",
      "Decision, cost, executed actions, and post-remediation health are merged by the orchestrator — call tools with empty args.",
      "Call writeReport, then writeBigQueryTrace, then finalizeRun in that order.",
      "After finalizeRun succeeds you are done — do not call more tools.",
    ].join(" "),
    userPrompt: [
      `Run ${run.id} is ready to finalize.`,
      `Decision: ${decision}`,
      `Top hypotheses:\n${JSON.stringify(run.hypotheses.slice(0, 3), null, 2)}`,
      `Evidence count: ${run.evidence.length}`,
      decision === "approved" && executedActions?.length
        ? `Executed remediation:\n${JSON.stringify(executedActions, null, 2)}`
        : "",
      healthAfter ? `Post-remediation health: ${JSON.stringify(healthAfter)}` : "",
      "Call writeReport via function calling, then writeBigQueryTrace, then finalizeRun.",
    ]
      .filter(Boolean)
      .join("\n"),
    tools: [...SCRIBE_TOOL_SEQUENCE],
    terminalTools: ["finalizeRun"],
    toolArgs: args as unknown as Record<string, unknown>,
    maxTurns: 6,
    maxToollessTurns: 3,
    mockFinalText: "Finalizing incident report via function calling.",
  });

  if (!toolsCalled.includes("finalizeRun")) {
    await runScribeFallback(run, args, toolsCalled);
  }
}

export async function runScribe(
  run: InvestigationRun,
  args: ScribeToolArgs,
  decision: "approved" | "denied",
  executedActions?: RemediationAction[],
  healthAfter?: { ok: boolean; detail: string },
): Promise<void> {
  if (config.reactEnabled) {
    await runScribeReact(run, args, decision, executedActions, healthAfter);
  } else {
    await runScribeDeterministic(run, args);
  }
}
