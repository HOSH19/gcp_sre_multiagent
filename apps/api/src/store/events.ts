import { newId, nowIso, type AgentEvent, type IncidentReport } from "@gcp-sre/shared";
import { getRun, saveRun } from "./runs.js";

export function appendEvent(
  runId: string,
  event: Omit<AgentEvent, "id" | "runId" | "at"> & { at?: string },
): AgentEvent {
  const run = getRun(runId);
  if (!run) throw new Error(`run not found: ${runId}`);
  const full: AgentEvent = {
    id: newId("evt"),
    runId,
    at: event.at ?? nowIso(),
    agent: event.agent,
    type: event.type,
    message: event.message,
    data: event.data,
    costUsdDelta: event.costUsdDelta,
    tokensIn: event.tokensIn,
    tokensOut: event.tokensOut,
  };
  run.events.push(full);
  if (event.costUsdDelta) run.costUsd += event.costUsdDelta;
  if (event.tokensIn) run.tokensIn += event.tokensIn;
  if (event.tokensOut) run.tokensOut += event.tokensOut;
  saveRun(run);
  return full;
}

export function setReport(runId: string, report: IncidentReport): void {
  const run = getRun(runId);
  if (!run) throw new Error(`run not found: ${runId}`);
  run.report = report;
  saveRun(run);
}
