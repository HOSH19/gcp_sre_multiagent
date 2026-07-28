export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api/backend";
export const CHAOS_URL = process.env.NEXT_PUBLIC_CHAOS_URL ?? "/api/chaos";
export const CHAOS_TOKEN = process.env.NEXT_PUBLIC_CHAOS_TOKEN ?? "dev-chaos-token";

export type ScenarioId = "http_500s" | "missing_config" | "bad_revision_traffic";

export interface AgentEvent {
  id: string;
  agent: string;
  type: string;
  message: string;
  at: string;
  data?: {
    tool?: string;
    model?: string;
    mocked?: boolean;
    summary?: string;
    source?: string;
    raw?: unknown;
    hypotheses?: unknown;
    [key: string]: unknown;
  };
  tokensIn?: number;
  tokensOut?: number;
  costUsdDelta?: number;
}

export interface Run {
  id: string;
  status: string;
  scenario?: ScenarioId;
  events: AgentEvent[];
  hypotheses: Array<{ rootCauseLabel: string; confidence: number; summary: string }>;
  proposedRemediation: {
    summary: string;
    risk: string;
    actions: Array<{ type: string; reason: string; details?: Record<string, string> }>;
  } | null;
  report: {
    eval?: { matched: boolean; expected: string; predicted: string };
    healthAfter?: { ok: boolean; detail: string };
    cost: { totalUsd: number };
    approval: { decision: string };
  } | null;
  costUsd: number;
  error?: string;
}

export type SoakScenarioPhase = "pending" | "running" | "passed" | "failed";

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
  status: "queued" | "running" | "completed" | "failed";
  createdAt: string;
  updatedAt: string;
  autoApprove: true;
  currentScenario: ScenarioId | null;
  currentRunId: string | null;
  results: SoakScenarioResult[];
  passed: number;
  total: number;
  totalCostUsd: number;
  error?: string;
}

export const SCENARIO_OPTIONS: { id: ScenarioId; label: string }[] = [
  { id: "http_500s", label: "HTTP 500s" },
  { id: "missing_config", label: "Missing config" },
  { id: "bad_revision_traffic", label: "Bad revision traffic" },
];
