import { BigQuery } from "@google-cloud/bigquery";
import { nowIso } from "@gcp-sre/shared";
import { config } from "../config.js";

let client: BigQuery | null = null;

function getBigQuery(): BigQuery {
  if (!client) {
    client = new BigQuery({ projectId: config.projectId });
  }
  return client;
}

export function resetBigQueryClient(): void {
  client = null;
}

export interface InvestigationTraceRow {
  runId: string;
  status?: string | null;
  scenario?: string | null;
  predicted?: string | null;
  expected?: string | null;
  costUsd?: number | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
  project?: string | null;
  ingestedAt?: string;
  targetService?: string | null;
  rootCause?: string | null;
  approvalDecision?: string | null;
  agentSteps?: number | null;
  toolCalls?: number | null;
  durationMs?: number | null;
  reportGcsUri?: string | null;
  region?: string | null;
  eventsJson?: string | null;
}

const MAX_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Insert one investigation trace row into BigQuery with simple retries. */
export async function insertInvestigationTrace(row: InvestigationTraceRow): Promise<void> {
  const ingestedAt = row.ingestedAt ?? nowIso();
  const payload = {
    runId: row.runId,
    status: row.status ?? null,
    scenario: row.scenario ?? null,
    predicted: row.predicted ?? null,
    expected: row.expected ?? null,
    costUsd: row.costUsd ?? null,
    tokensIn: row.tokensIn ?? null,
    tokensOut: row.tokensOut ?? null,
    project: row.project ?? config.projectId,
    ingestedAt,
    targetService: row.targetService ?? null,
    rootCause: row.rootCause ?? null,
    approvalDecision: row.approvalDecision ?? null,
    agentSteps: row.agentSteps ?? null,
    toolCalls: row.toolCalls ?? null,
    durationMs: row.durationMs ?? null,
    reportGcsUri: row.reportGcsUri ?? null,
    region: row.region ?? config.region,
    eventsJson: row.eventsJson ?? null,
  };

  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await getBigQuery()
        .dataset(config.bqDataset)
        .table(config.bqTracesTable)
        .insert([payload]);
      return;
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_ATTEMPTS) await sleep(100 * attempt);
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`BigQuery insert failed: ${String(lastErr)}`);
}
