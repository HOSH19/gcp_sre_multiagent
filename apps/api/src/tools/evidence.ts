import { newId, nowIso, type EvidenceItem } from "@gcp-sre/shared";

export function evidence(source: string, summary: string, raw?: unknown): EvidenceItem {
  return { id: newId("ev"), source, summary, raw, at: nowIso() };
}
