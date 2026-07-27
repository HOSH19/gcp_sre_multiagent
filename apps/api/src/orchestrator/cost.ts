import type { IncidentReport, InvestigationRun } from "@gcp-sre/shared";

export function modelBreakdown(run: InvestigationRun): IncidentReport["cost"]["modelBreakdown"] {
  const out: IncidentReport["cost"]["modelBreakdown"] = {};
  for (const evt of run.events) {
    if (!evt.costUsdDelta) continue;
    const model = String((evt.data as { model?: string } | undefined)?.model ?? "unknown");
    out[model] ??= { usd: 0, tokensIn: 0, tokensOut: 0 };
    out[model].usd += evt.costUsdDelta;
    out[model].tokensIn += evt.tokensIn ?? 0;
    out[model].tokensOut += evt.tokensOut ?? 0;
  }
  return out;
}
