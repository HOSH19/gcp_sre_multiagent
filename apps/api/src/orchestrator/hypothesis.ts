import { newId, type HypothesisItem, type InvestigationRun } from "@gcp-sre/shared";

type HealthRaw = {
  patient?: { reason?: string };
  chaosState?: { activeScenario?: string | null; traffic?: Record<string, number> };
};

function pushHyp(
  list: HypothesisItem[],
  label: string,
  confidence: number,
  summary: string,
  evidenceIds: string[],
) {
  list.push({ id: newId("hyp"), rootCauseLabel: label, confidence, summary, evidenceIds });
}

export function inferHypotheses(run: InvestigationRun): { hypotheses: HypothesisItem[]; ruledOut: string[] } {
  const health = run.evidence.find((e) => e.source === "getServiceHealth")?.raw as HealthRaw | undefined;
  const traffic =
    (run.evidence.find((e) => e.source === "getRevisionTraffic")?.raw as { traffic?: Record<string, number> })
      ?.traffic ??
    health?.chaosState?.traffic ??
    {};
  const env = run.evidence.find((e) => e.source === "getServiceEnv")?.raw as { hasAppSecret?: boolean } | undefined;
  const active = health?.chaosState?.activeScenario ?? null;
  const badPct = Object.entries(traffic)
    .filter(([n]) => n.includes("bad"))
    .reduce((s, [, p]) => s + p, 0);

  const hypotheses: HypothesisItem[] = [];
  const ids = (...sources: string[]) => run.evidence.filter((e) => sources.includes(e.source)).map((e) => e.id);

  if (active === "missing_config" || health?.patient?.reason === "missing_required_env" || env?.hasAppSecret === false) {
    pushHyp(hypotheses, "missing_required_env", 0.92, "Required APP_SECRET env is missing.", ids("getServiceEnv", "getServiceHealth"));
  }
  if (active === "bad_revision_traffic" || health?.patient?.reason === "unhealthy_revision" || badPct > 0) {
    pushHyp(hypotheses, "unhealthy_revision_receiving_traffic", 0.9, "Unhealthy revision is receiving traffic.", ids("getRevisionTraffic", "listRevisions"));
  }
  if (active === "http_500s" || health?.patient?.reason === "chaos_force_500") {
    pushHyp(hypotheses, "application_exception_500", 0.91, "Application returning forced HTTP 500s.", ids("queryLogs", "listRecentErrors", "getServiceHealth"));
  }

  hypotheses.sort((a, b) => b.confidence - a.confidence);
  const labels = ["missing_required_env", "unhealthy_revision_receiving_traffic", "application_exception_500"];
  const ruledOut = labels.filter((l) => !hypotheses.some((h) => h.rootCauseLabel === l));
  if (!hypotheses.length) {
    pushHyp(hypotheses, "unknown", 0.4, "Insufficient evidence.", run.evidence.map((e) => e.id));
  }
  return { hypotheses, ruledOut };
}
