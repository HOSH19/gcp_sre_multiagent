import type { InvestigationRun } from "@gcp-sre/shared";

export const runs = new Map<string, InvestigationRun>();
export const traces: Array<Record<string, unknown>> = [];
export let activeRunId: string | null = null;

export function setActiveRunId(id: string | null): void {
  activeRunId = id;
}
