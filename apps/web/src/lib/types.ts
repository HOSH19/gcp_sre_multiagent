import { SCENARIOS, type ScenarioId } from "@gcp-sre/shared";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api/backend";

export type {
  AgentEvent,
  HypothesisItem,
  InvestigationRun as Run,
  ScenarioId,
} from "@gcp-sre/shared";

export { SCENARIOS };

export const SCENARIO_OPTIONS: { id: ScenarioId; label: string }[] = Object.values(SCENARIOS).map(
  (s) => ({ id: s.id, label: s.label }),
);

export function scenarioLabel(scenario: string): string {
  return SCENARIO_OPTIONS.find((s) => s.id === scenario)?.label ?? scenario;
}
