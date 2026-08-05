const CANONICAL_ROOT_CAUSES = [
  "application_exception_500",
  "missing_required_env",
  "unhealthy_revision_receiving_traffic",
] as const;

type CanonicalRootCause = (typeof CANONICAL_ROOT_CAUSES)[number];

function normalizeRootCauseLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const ROOT_CAUSE_ALIASES: Record<string, CanonicalRootCause> = {
  traffic_directed_to_an_unhealthy_revision: "unhealthy_revision_receiving_traffic",
  unhealthy_revision_is_receiving_traffic: "unhealthy_revision_receiving_traffic",
  unhealthy_revision_receiving_traffic: "unhealthy_revision_receiving_traffic",
  unhealthy_active_revision: "unhealthy_revision_receiving_traffic",
  active_unhealthy_revision: "unhealthy_revision_receiving_traffic",
  active_revision_is_unhealthy: "unhealthy_revision_receiving_traffic",
  bad_revision_traffic: "unhealthy_revision_receiving_traffic",
  revision_failed_readiness: "unhealthy_revision_receiving_traffic",
  // GCP-style failure reason surfaced by UI when a revision is disabled
  // (e.g. by user action or automation), which still corresponds to
  // "unhealthy revision receiving traffic" for our scenario expectations.
  revision_was_disabled_by_user_or_automated_process: "unhealthy_revision_receiving_traffic",

  missing_required_env: "missing_required_env",
  missing_env_var: "missing_required_env",
  missing_configuration: "missing_required_env",
  app_secret_missing: "missing_required_env",
  required_env_missing: "missing_required_env",

  application_exception_500: "application_exception_500",
  http_500: "application_exception_500",
  http_500s: "application_exception_500",
  forced_http_500: "application_exception_500",
  application_error_500: "application_exception_500",
  chaos_force_500: "application_exception_500",
  force_500: "application_exception_500",
  fault_injection: "application_exception_500",
  chaos_fault_injection: "application_exception_500",
};

function canonicalizeRootCause(label: string): string {
  const norm = normalizeRootCauseLabel(label);
  return ROOT_CAUSE_ALIASES[norm] ?? norm;
}

const FUZZY_MATCHERS: Record<string, (predicted: string) => boolean> = {
  unhealthy_revision_receiving_traffic: (predicted) => {
    const looksLikeUnhealthyTraffic =
      predicted.includes("unhealthy") &&
      predicted.includes("revision") &&
      (predicted.includes("traffic") ||
        predicted.includes("directed") ||
        predicted.includes("serving") ||
        predicted.includes("active"));

    const looksLikeDisabledRevision =
      predicted.includes("revision") &&
      (predicted.includes("disabled") || predicted.includes("disable")) &&
      (predicted.includes("user") ||
        predicted.includes("automated") ||
        predicted.includes("process"));

    // For our scenario expectations, both "unhealthy revision" and
    // "revision disabled by user/automation" represent the same outcome:
    // the traffic is not being served by a healthy revision.
    return looksLikeUnhealthyTraffic || looksLikeDisabledRevision;
  },
  missing_required_env: (predicted) =>
    predicted.includes("missing") &&
    (predicted.includes("env") || predicted.includes("config") || predicted.includes("secret")),
  application_exception_500: (predicted) => {
    const has500 = predicted.includes("500");
    const hasException = predicted.includes("exception");
    const hasFaultInjection = predicted.includes("fault") && predicted.includes("injection");
    const hasChaosForce = predicted.includes("chaos") || predicted.includes("force_500");
    const hasIntentional = predicted.includes("intentionally") || predicted.includes("intentional");
    const hasApplicationContext =
      predicted.includes("http") ||
      predicted.includes("application") ||
      predicted.includes("error") ||
      predicted.includes("chaos") ||
      predicted.includes("fault") ||
      predicted.includes("force") ||
      hasIntentional;

    return hasFaultInjection || hasChaosForce || ((has500 || hasException) && hasApplicationContext);
  },
};

/**
 * Eval match: exact for deterministic labels, fuzzy for ReAct free-form text.
 * Keeps CI (REACT=off) strict via canonical labels from inferHypotheses.
 */
export function matchRootCause(predicted: string, expected: string): boolean {
  if (!predicted || !expected) return false;
  if (predicted === expected) return true;

  const predictedCanon = canonicalizeRootCause(predicted);
  const expectedCanon = canonicalizeRootCause(expected);
  if (predictedCanon === expectedCanon) return true;

  const matcher = FUZZY_MATCHERS[expectedCanon];
  return matcher ? matcher(predictedCanon) : false;
}
