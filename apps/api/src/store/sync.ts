import type { InvestigationRun } from "@gcp-sre/shared";
import { config } from "../config.js";
import { insertInvestigationTrace, type InvestigationTraceRow } from "./bigquery.js";
import { firestoreSaveRun } from "./firestore.js";
import { appendTrace } from "./traces.js";

/** Persist run to Firestore when durable store is enabled. Idempotent with saveRun. */
export async function syncRunToFirestore(run: InvestigationRun): Promise<void> {
  if (!config.useDurableStore) return;
  await firestoreSaveRun(run);
}

/**
 * Append to in-memory traces always; insert into BigQuery when durable store is on.
 * Throws on BQ failure when `config.bqFailClosed` (default in gcp durable mode).
 */
export async function syncTraceToBigQuery(row: Record<string, unknown>): Promise<void> {
  appendTrace(row);
  if (!config.useDurableStore) return;

  const trace: InvestigationTraceRow = {
    runId: String(row.runId),
    status: (row.status as string | null | undefined) ?? null,
    scenario: (row.scenario as string | null | undefined) ?? null,
    predicted: (row.predicted as string | null | undefined) ?? null,
    expected: (row.expected as string | null | undefined) ?? null,
    costUsd: typeof row.costUsd === "number" ? row.costUsd : null,
    tokensIn: typeof row.tokensIn === "number" ? row.tokensIn : null,
    tokensOut: typeof row.tokensOut === "number" ? row.tokensOut : null,
    project: (row.project as string | null | undefined) ?? config.projectId,
    targetService: (row.targetService as string | null | undefined) ?? null,
    rootCause: (row.rootCause as string | null | undefined) ?? null,
    approvalDecision: (row.approvalDecision as string | null | undefined) ?? null,
    agentSteps: typeof row.agentSteps === "number" ? row.agentSteps : null,
    toolCalls: typeof row.toolCalls === "number" ? row.toolCalls : null,
    durationMs: typeof row.durationMs === "number" ? row.durationMs : null,
    reportGcsUri: (row.reportGcsUri as string | null | undefined) ?? null,
    region: (row.region as string | null | undefined) ?? config.region,
    eventsJson: typeof row.eventsJson === "string" ? row.eventsJson : null,
  };

  try {
    await insertInvestigationTrace(trace);
  } catch (err) {
    if (config.bqFailClosed) throw err;
    console.error("[bq] insert failed (fail-open):", err);
  }
}

export { uploadReportArtifact, uploadEvidenceArtifact, uploadRunJsonArtifact } from "./gcs.js";
