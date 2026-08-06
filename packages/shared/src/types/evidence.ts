export interface HypothesisItem {
  id: string;
  /** Free-form human-readable root-cause label. */
  rootCauseLabel: string;
  /**
   * Canonical scenario label when known:
   * `unhealthy_revision_receiving_traffic` | `missing_required_env`.
   * Free-form when the cause does not map to a known scenario; omitted on older runs.
   */
  canonicalRootCause?: string;
  confidence: number;
  summary: string;
  evidenceIds: string[];
}

/** One piece of gathered investigation evidence. */
export interface EvidenceItem {
  id: string;
  source: string;
  summary: string;
  raw?: unknown;
  at: string;
}
