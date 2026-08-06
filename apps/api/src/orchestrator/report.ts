import { nowIso, type InvestigationRun, type RemediationAction } from "@gcp-sre/shared";
import {
  SCRIBE_TOOL_SEQUENCE,
  type ScribeToolArgs,
} from "../tools/index.js";
import { modelBreakdown } from "./cost.js";
import { llmStep, runTool } from "./runner.js";

/**
 * Build orchestrator-owned Scribe args (decision, cost, health).
 * Persistence tools refuse to run without these — models cannot skip them.
 */
function buildScribeArgs(
  run: InvestigationRun,
  decision: "approved" | "denied",
  executedActions?: RemediationAction[],
  healthAfter?: { ok: boolean; detail: string },
): ScribeToolArgs {
  return {
    decision,
    executedActions: decision === "approved" ? executedActions : undefined,
    healthAfter,
    cost: {
      totalUsd: run.costUsd,
      totalTokensIn: run.tokensIn,
      totalTokensOut: run.tokensOut,
      modelBreakdown: modelBreakdown(run),
    },
  };
}

/**
 * Invoke Scribe tools in fixed order via runTool.
 * Persistence order is mandatory (writeReport → writeBigQueryTrace → finalizeRun);
 * buildScribeArgs remains orchestrator-owned so the model cannot skip decision/cost.
 */
async function runScribeTools(run: InvestigationRun, args: ScribeToolArgs): Promise<void> {
  const payload = args as unknown as Record<string, unknown>;
  for (const tool of SCRIBE_TOOL_SEQUENCE) {
    await runTool(run, "scribe", tool, payload);
  }
}

export async function finalizeWithScribe(
  run: InvestigationRun,
  decision: "approved" | "denied",
  executedActions?: RemediationAction[],
  healthAfter?: { ok: boolean; detail: string },
): Promise<void> {
  await llmStep(
    run,
    "scribe",
    "You are Scribe. Finalize the incident by calling writeReport, writeBigQueryTrace, then finalizeRun. Use only the orchestrator-supplied decision, cost, and hypotheses — do not invent them.",
    [
      `run=${run.id}`,
      `decision=${decision}`,
      `hypotheses=${JSON.stringify(run.hypotheses)}`,
      `costUsd=${run.costUsd}`,
      `at=${nowIso()}`,
    ].join(" "),
    `{"tools":${JSON.stringify([...SCRIBE_TOOL_SEQUENCE])}}`,
  );

  const scribeArgs = buildScribeArgs(run, decision, executedActions, decision === "approved" ? healthAfter : undefined);
  await runScribeTools(run, scribeArgs);
}
