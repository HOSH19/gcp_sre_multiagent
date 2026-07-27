export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api/backend";
export const CHAOS_URL = process.env.NEXT_PUBLIC_CHAOS_URL ?? "/api/chaos";
export const CHAOS_TOKEN = process.env.NEXT_PUBLIC_CHAOS_TOKEN ?? "dev-chaos-token";

export type ScenarioId = "http_500s" | "missing_config" | "bad_revision_traffic";

export interface Run {
  id: string;
  status: string;
  scenario?: ScenarioId;
  events: Array<{ id: string; agent: string; type: string; message: string; at: string }>;
  hypotheses: Array<{ rootCauseLabel: string; confidence: number; summary: string }>;
  proposedRemediation: { summary: string; risk: string; actions: unknown[] } | null;
  report: {
    eval?: { matched: boolean; expected: string; predicted: string };
    healthAfter?: { ok: boolean; detail: string };
    cost: { totalUsd: number };
    approval: { decision: string };
  } | null;
  costUsd: number;
  error?: string;
}

export const SCENARIO_OPTIONS: { id: ScenarioId; label: string }[] = [
  { id: "http_500s", label: "HTTP 500s" },
  { id: "missing_config", label: "Missing config" },
  { id: "bad_revision_traffic", label: "Bad revision traffic" },
];
