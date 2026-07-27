export interface HypothesisItem {
  id: string;
  rootCauseLabel: string;
  confidence: number;
  summary: string;
  evidenceIds: string[];
}

export interface EvidenceItem {
  id: string;
  source: string;
  summary: string;
  raw?: unknown;
  at: string;
}
