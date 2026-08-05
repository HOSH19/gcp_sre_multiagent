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
  bad_revision_traffic: "unhealthy_revision_receiving_traffic",
  revision_failed_readiness: "unhealthy_revision_receiving_traffic",

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
};

function canonicalizeRootCause(label: string): string {
  const norm = normalizeRootCauseLabel(label);
  return ROOT_CAUSE_ALIASES[norm] ?? norm;
}

const FUZZY_MATCHERS: Record<string, (predicted: string) => boolean> = {
  unhealthy_revision_receiving_traffic: (predicted) =>
    predicted.includes("unhealthy") &&
    predicted.includes("revision") &&
    (predicted.includes("traffic") ||
      predicted.includes("directed") ||
      predicted.includes("serving")),
  missing_required_env: (predicted) =>
    predicted.includes("missing") &&
    (predicted.includes("env") || predicted.includes("config") || predicted.includes("secret")),
  application_exception_500: (predicted) =>
    (predicted.includes("500") || predicted.includes("exception")) &&
    (predicted.includes("http") || predicted.includes("application") || predicted.includes("error")),
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
