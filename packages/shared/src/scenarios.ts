/** Demo / eval scenario identifiers. */
export type ScenarioId = "missing_config" | "bad_revision_traffic";

interface ScenarioDef {
  id: ScenarioId;
  label: string;
  expectedRootCause: string;
  description: string;
}

/** Canonical chaos scenarios and their expected root-cause labels. */
export const SCENARIOS: Record<ScenarioId, ScenarioDef> = {
  missing_config: {
    id: "missing_config",
    label: "Missing config",
    expectedRootCause: "missing_required_env",
    description: "Required env var removed.",
  },
  bad_revision_traffic: {
    id: "bad_revision_traffic",
    label: "Bad revision traffic",
    expectedRootCause: "unhealthy_revision_receiving_traffic",
    description: "Traffic shifted to an unhealthy revision.",
  },
};
