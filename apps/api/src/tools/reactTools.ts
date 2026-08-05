import { newId, type HypothesisItem, type InvestigationRun } from "@gcp-sre/shared";
import type { ToolCallContext } from "./types.js";
import { mapProposalThroughPolicy } from "../orchestrator/policy.js";
import { proposeRemediation as deterministicPropose } from "./remediate.js";
import { patchEnvVars, rollbackTraffic } from "./remediate.js";
import { verifyHealth } from "./health.js";

function parseHypotheses(raw: unknown): HypothesisItem[] {
  if (!Array.isArray(raw)) return [];
  const out: HypothesisItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const label = typeof obj.rootCauseLabel === "string" ? obj.rootCauseLabel.trim() : "";
    if (!label) continue;
    const confidence = typeof obj.confidence === "number" ? Math.min(1, Math.max(0, obj.confidence)) : 0.5;
    const summary = typeof obj.summary === "string" ? obj.summary : label;
    const evidenceIds = Array.isArray(obj.evidenceIds)
      ? obj.evidenceIds.filter((x): x is string => typeof x === "string")
      : [];
    out.push({
      id: typeof obj.id === "string" ? obj.id : newId("hyp"),
      rootCauseLabel: label,
      confidence,
      summary,
      evidenceIds,
    });
  }
  out.sort((a, b) => b.confidence - a.confidence);
  return out;
}

/** ReAct terminal tool — free-form rootCauseLabel. */
export async function submitHypotheses(ctx: ToolCallContext): Promise<unknown> {
  const { run, args } = ctx;
  const hypotheses = parseHypotheses(args?.hypotheses);
  if (!hypotheses.length) {
    throw new Error("submitHypotheses requires at least one hypothesis with rootCauseLabel");
  }
  const ruledOut = Array.isArray(args?.ruledOut)
    ? args!.ruledOut.filter((x): x is string => typeof x === "string")
    : [];
  run.hypotheses = hypotheses;
  run.ruledOut = ruledOut;
  return {
    ok: true,
    top: hypotheses[0]?.rootCauseLabel,
    count: hypotheses.length,
    ruledOut,
  };
}

/**
 * Propose remediation. With args from the LLM → policy map; without args → deterministic oracle.
 */
export async function proposeRemediationTool(ctx: ToolCallContext): Promise<unknown> {
  const { run, args } = ctx;
  if (args && (args.actions || args.summary)) {
    const { proposal, executable, proposeOnly } = mapProposalThroughPolicy({
      summary: typeof args.summary === "string" ? args.summary : undefined,
      risk: typeof args.risk === "string" ? args.risk : undefined,
      actions: Array.isArray(args.actions) ? args.actions : [],
    });
    run.proposedRemediation = proposal;
    return {
      ok: true,
      proposal,
      executableCount: executable.length,
      proposeOnly: proposeOnly.map((a) => a.type),
    };
  }
  const proposal = deterministicPropose(run);
  run.proposedRemediation = proposal;
  return { ok: true, proposal, source: "deterministic" };
}

export async function rollbackTrafficTool(_ctx: ToolCallContext): Promise<unknown> {
  return rollbackTraffic();
}

export async function patchEnvVarsTool(ctx: ToolCallContext): Promise<unknown> {
  const varsRaw = ctx.args?.vars ?? ctx.args;
  const vars: Record<string, string> = {};
  if (varsRaw && typeof varsRaw === "object") {
    for (const [k, v] of Object.entries(varsRaw as Record<string, unknown>)) {
      if (k === "vars") continue;
      if (typeof v === "string") vars[k] = v;
      else if (v != null) vars[k] = String(v);
    }
  }
  return patchEnvVars(vars);
}

export async function verifyHealthTool(_ctx: ToolCallContext): Promise<unknown> {
  return verifyHealth();
}

/** Apply deterministic proposal when ReAct did not call proposeRemediation. */
export function ensureRemediationProposal(run: InvestigationRun): void {
  if (!run.proposedRemediation) {
    run.proposedRemediation = deterministicPropose(run);
  }
}
