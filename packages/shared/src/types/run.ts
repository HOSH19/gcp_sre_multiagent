import type { ScenarioId } from "../scenarios.js";
import type { AgentName, RunStatus } from "./agents.js";
import type { EvidenceItem, HypothesisItem } from "./evidence.js";
import type { MappedAlert } from "./registry.js";
import type { RemediationAction, RemediationProposal } from "./remediation.js";

export interface IncidentReport {
  runId: string;
  timeline: Array<{ at: string; message: string; agent?: AgentName }>;
  evidence: EvidenceItem[];
  hypotheses: HypothesisItem[];
  ruledOut: string[];
  proposedRemediation: RemediationProposal | null;
  approval: {
    decision: "approved" | "denied" | "pending" | "none";
    at?: string;
    executedActions?: RemediationAction[];
  };
  cost: {
    totalUsd: number;
    totalTokensIn: number;
    totalTokensOut: number;
    modelBreakdown: Record<string, { usd: number; tokensIn: number; tokensOut: number }>;
  };
  healthAfter?: { ok: boolean; detail: string };
  expectedScenario?: ScenarioId;
  eval?: { matched: boolean; expected: string; predicted: string };
}

export interface InvestigationRun {
  id: string;
  status: RunStatus;
  createdAt: string;
  updatedAt: string;
  trigger: "manual" | "alert" | "cli" | "eval";
  scenario?: ScenarioId;
  /** @deprecated Prefer targetService; kept for backward compatibility. */
  patientService: string;
  /** Service under investigation (Cloud Run service name). Defaults to patientService. */
  targetService: string;
  projectId?: string;
  region?: string;
  events: AgentEvent[];
  evidence: EvidenceItem[];
  hypotheses: HypothesisItem[];
  ruledOut: string[];
  proposedRemediation: RemediationProposal | null;
  report: IncidentReport | null;
  stepCount: number;
  toolCallCount: number;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
  error?: string;
  shareUrl?: string;
  /** GCS URI for finalized report JSON (gs://...). */
  reportGcsUri?: string;
  /** Instance that holds the investigation lease. */
  leaseOwner?: string;
  /** ISO timestamp when the lease expires. */
  leaseExpiresAt?: string;
  /** Structured alert that triggered this run (or latest correlated alert). */
  alert?: MappedAlert;
}

export interface AgentEvent {
  id: string;
  runId: string;
  agent: AgentName;
  type: "thought" | "tool_call" | "tool_result" | "status" | "error";
  message: string;
  data?: unknown;
  at: string;
  costUsdDelta?: number;
  tokensIn?: number;
  tokensOut?: number;
}
