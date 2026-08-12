import { matchRootCause, type InvestigationRun } from "@gcp-sre/shared";

/** Prefer agent-emitted canonical id; fall back to free-form label. */
export function predictedRootCause(run: InvestigationRun): string {
  const top = run.hypotheses[0];
  if (!top) return "unknown";
  const canonical = top.canonicalRootCause?.trim();
  if (canonical) return canonical;
  return top.rootCauseLabel || "unknown";
}

export function isMissingRequiredEnv(run: InvestigationRun): boolean {
  return matchRootCause(predictedRootCause(run), "missing_required_env");
}

export function isUnhealthyRevisionTraffic(run: InvestigationRun): boolean {
  return matchRootCause(predictedRootCause(run), "unhealthy_revision_receiving_traffic");
}
