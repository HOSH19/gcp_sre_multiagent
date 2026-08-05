import type { InvestigationRun } from "@gcp-sre/shared";

export const runs = new Map<string, InvestigationRun>();
export const traces: Array<Record<string, unknown>> = [];

/** @deprecated Prefer activeRunIds — kept for single-holder callers / health display. */
export let activeRunId: string | null = null;

/** In-memory investigation lease holders (MODE=local / STORE_BACKEND=memory). */
export const activeRunIds = new Set<string>();

export function setActiveRunId(id: string | null): void {
  activeRunId = id;
  if (id === null) {
    activeRunIds.clear();
    return;
  }
  activeRunIds.add(id);
}

export function addActiveRunId(id: string): void {
  activeRunIds.add(id);
  activeRunId = id;
}

export function removeActiveRunId(id: string): void {
  activeRunIds.delete(id);
  if (activeRunId === id) {
    activeRunId = activeRunIds.size ? [...activeRunIds][activeRunIds.size - 1]! : null;
  }
}
