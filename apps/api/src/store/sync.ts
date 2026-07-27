import type { InvestigationRun } from "@gcp-sre/shared";
import { config } from "../config.js";
import { appendTrace } from "./traces.js";

export async function syncRunToFirestore(run: InvestigationRun): Promise<void> {
  if (config.mode !== "gcp") return;
  void run;
}

export async function syncTraceToBigQuery(row: Record<string, unknown>): Promise<void> {
  appendTrace(row);
  if (config.mode !== "gcp") return;
}
