function matchesUnhealthyRevision(predicted: string): boolean {
  const unhealthyTraffic =
    predicted.includes("unhealthy") &&
    predicted.includes("revision") &&
    (predicted.includes("traffic") ||
      predicted.includes("directed") ||
      predicted.includes("serving") ||
      predicted.includes("active"));

  const disabledRevision =
    predicted.includes("revision") &&
    (predicted.includes("disabled") || predicted.includes("disable")) &&
    (predicted.includes("user") ||
      predicted.includes("automated") ||
      predicted.includes("process"));

  return unhealthyTraffic || disabledRevision;
}

function matchesMissingEnv(predicted: string): boolean {
  return (
    predicted.includes("missing") &&
    (predicted.includes("env") || predicted.includes("config") || predicted.includes("secret"))
  );
}

const FUZZY_MATCHERS: Record<string, (predicted: string) => boolean> = {
  unhealthy_revision_receiving_traffic: matchesUnhealthyRevision,
  missing_required_env: matchesMissingEnv,
};

/** Keyword fallback when alias canonicalization does not equate predicted vs expected. */
export function fuzzyMatchRootCause(predictedCanon: string, expectedCanon: string): boolean {
  const matcher = FUZZY_MATCHERS[expectedCanon];
  return matcher ? matcher(predictedCanon) : false;
}
