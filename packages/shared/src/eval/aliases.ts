type CanonicalRootCause =
  | "missing_required_env"
  | "unhealthy_revision_receiving_traffic";

const ROOT_CAUSE_ALIASES: Record<string, CanonicalRootCause> = {
  traffic_directed_to_an_unhealthy_revision: "unhealthy_revision_receiving_traffic",
  unhealthy_revision_is_receiving_traffic: "unhealthy_revision_receiving_traffic",
  unhealthy_revision_receiving_traffic: "unhealthy_revision_receiving_traffic",
  unhealthy_active_revision: "unhealthy_revision_receiving_traffic",
  active_unhealthy_revision: "unhealthy_revision_receiving_traffic",
  active_revision_is_unhealthy: "unhealthy_revision_receiving_traffic",
  bad_revision_traffic: "unhealthy_revision_receiving_traffic",
  revision_failed_readiness: "unhealthy_revision_receiving_traffic",
  revision_was_disabled_by_user_or_automated_process: "unhealthy_revision_receiving_traffic",

  missing_required_env: "missing_required_env",
  missing_env_var: "missing_required_env",
  missing_configuration: "missing_required_env",
  app_secret_missing: "missing_required_env",
  required_env_missing: "missing_required_env",
};

function trimUnderscores(s: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && s[start] === "_") start++;
  while (end > start && s[end - 1] === "_") end--;
  return s.slice(start, end);
}

function normalizeRootCauseLabel(label: string): string {
  const normalized = label
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "_");
  return trimUnderscores(normalized);
}

/** Map a free-form label to a known canonical id when an alias matches. */
export function canonicalizeRootCause(label: string): string {
  const norm = normalizeRootCauseLabel(label);
  return ROOT_CAUSE_ALIASES[norm] ?? norm;
}
