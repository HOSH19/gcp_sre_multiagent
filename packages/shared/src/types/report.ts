import type { ScenarioId } from "../scenarios.js";
import type { AgentName } from "./agents.js";
import type { EvidenceItem, HypothesisItem } from "./evidence.js";
import type { RemediationAction, RemediationProposal } from "./remediation.js";

/** Final incident report written by the scribe. */
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
