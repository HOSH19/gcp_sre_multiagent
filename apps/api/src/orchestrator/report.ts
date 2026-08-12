import { type InvestigationRun, type RemediationAction } from "@gcp-sre/shared";
import { type ScribeToolArgs } from "../tools/index.js";
import { runScribe } from "./agentScribe.js";
import { modelBreakdown } from "./cost.js";

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

export async function finalizeWithScribe(
  run: InvestigationRun,
  decision: "approved" | "denied",
  executedActions?: RemediationAction[],
  healthAfter?: { ok: boolean; detail: string },
): Promise<void> {
  const scribeArgs = buildScribeArgs(run, decision, executedActions, decision === "approved" ? healthAfter : undefined);
  await runScribe(run, scribeArgs, decision, executedActions, decision === "approved" ? healthAfter : undefined);
}
