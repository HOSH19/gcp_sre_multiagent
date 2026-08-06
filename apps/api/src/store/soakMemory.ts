import type { ScenarioId } from "@gcp-sre/shared";

type SoakJobStatus = "queued" | "running" | "completed" | "failed";
type SoakScenarioPhase = "pending" | "running" | "passed" | "failed";

export interface SoakScenarioResult {
  scenario: ScenarioId;
  phase: SoakScenarioPhase;
  ok?: boolean;
  matched?: boolean;
  healthy?: boolean;
  predicted?: string;
  expected?: string;
  costUsd?: number;
  runId?: string;
  reason?: string;
}

export interface SoakJob {
  id: string;
  status: SoakJobStatus;
  createdAt: string;
  updatedAt: string;
  /** Always true — soak auto-approves remediation like CLI eval. */
  autoApprove: true;
  currentScenario: ScenarioId | null;
  currentRunId: string | null;
  results: SoakScenarioResult[];
  passed: number;
  total: number;
  totalCostUsd: number;
  error?: string;
}

export const soaks = new Map<string, SoakJob>();
export let activeSoakId: string | null = null;

export function setActiveSoakId(id: string | null): void {
  activeSoakId = id;
}
