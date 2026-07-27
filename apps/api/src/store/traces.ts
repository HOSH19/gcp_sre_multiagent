import { nowIso } from "@gcp-sre/shared";
import { traces } from "./memory.js";

export function appendTrace(row: Record<string, unknown>): void {
  traces.push({ ...row, ingestedAt: nowIso() });
}

export function listTraces(): Array<Record<string, unknown>> {
  return [...traces];
}
