import { newId, type HypothesisItem, type InvestigationRun } from "@gcp-sre/shared";

type HealthRaw = {
  patient?: { reason?: string; ok?: boolean };
  chaosState?: {
    activeScenario?: string | null;
    traffic?: Record<string, number>;
    badRevision?: string;
    goodRevision?: string;
  };
};

function pushHyp(
  list: HypothesisItem[],
  label: string,
  confidence: number,
  summary: string,
  evidenceIds: string[],
) {
  list.push({
    id: newId("hyp"),
    rootCauseLabel: label,
    canonicalRootCause: label,
    confidence,
    summary,
    evidenceIds,
  });
}

export function inferHypotheses(run: InvestigationRun): { hypotheses: HypothesisItem[]; ruledOut: string[] } {
  const health = run.evidence.find((e) => e.source === "getServiceHealth")?.raw as HealthRaw | undefined;
  const traffic =
    (run.evidence.find((e) => e.source === "getRevisionTraffic")?.raw as { traffic?: Record<string, number> })
      ?.traffic ??
    health?.chaosState?.traffic ??
    {};
  const env = run.evidence.find((e) => e.source === "getServiceEnv")?.raw as { hasAppSecret?: boolean } | undefined;
  const revisions = run.evidence.find((e) => e.source === "listRevisions")?.raw as
    | { revisions?: Array<{ name: string; healthy: boolean }> }
    | undefined;
  const active = health?.chaosState?.activeScenario ?? null;
  const badRevision =
    health?.chaosState?.badRevision ??
    revisions?.revisions?.find((r) => !r.healthy)?.name ??
    undefined;

  const badPct = Object.entries(traffic)
    .filter(([n]) => (badRevision ? n === badRevision || n.endsWith(`/${badRevision}`) : n.includes("bad")))
    .reduce((s, [, p]) => s + p, 0);

  const unhealthyServing =
    health?.patient?.reason === "unhealthy_revision" ||
    (badPct > 0 && health?.patient?.ok === false);

  const hypotheses: HypothesisItem[] = [];
  const ids = (...sources: string[]) => run.evidence.filter((e) => sources.includes(e.source)).map((e) => e.id);

  if (health?.patient?.reason === "missing_required_env" || env?.hasAppSecret === false || active === "missing_config") {
    pushHyp(
      hypotheses,
      "missing_required_env",
      health?.patient?.reason === "missing_required_env" || env?.hasAppSecret === false ? 0.94 : 0.88,
      "Required APP_SECRET env is missing.",
      ids("getServiceEnv", "getServiceHealth"),
    );
  }
  if (unhealthyServing || active === "bad_revision_traffic" || badPct > 0) {
    pushHyp(
      hypotheses,
      "unhealthy_revision_receiving_traffic",
      unhealthyServing || badPct > 0 ? 0.93 : 0.86,
      "Unhealthy revision is receiving traffic.",
      ids("getRevisionTraffic", "listRevisions", "getServiceHealth"),
    );
  }

  hypotheses.sort((a, b) => b.confidence - a.confidence);
  const labels = ["missing_required_env", "unhealthy_revision_receiving_traffic"];
  const ruledOut = labels.filter((l) => !hypotheses.some((h) => h.rootCauseLabel === l));
  if (!hypotheses.length) {
    pushHyp(hypotheses, "unknown", 0.4, "Insufficient evidence.", run.evidence.map((e) => e.id));
  }
  return { hypotheses, ruledOut };
}
