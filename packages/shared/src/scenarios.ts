export type ScenarioId = "http_500s" | "missing_config" | "bad_revision_traffic";

export interface ScenarioDef {
  id: ScenarioId;
  label: string;
  expectedRootCause: string;
  description: string;
}

export const SCENARIOS: Record<ScenarioId, ScenarioDef> = {
  http_500s: {
    id: "http_500s",
    label: "HTTP 500s",
    expectedRootCause: "application_exception_500",
    description: "Patient app returns forced HTTP 500 responses.",
  },
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
