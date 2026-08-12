import type { AgentEvent } from "@gcp-sre/shared";
import { eventData, tryParseJson } from "@/lib/timeline/json";

function sanitizeData(data: Record<string, unknown> | undefined) {
  if (!data) return data;
  const { raw, ...rest } = data;
  if (raw && typeof raw === "object") return { ...rest, raw };
  return rest;
}

export function eventDetails(event: AgentEvent): { kind: "json" | "text"; value: string } | null {
  if (event.type === "thought") {
    const asJson = tryParseJson(event.message);
    if (asJson) {
      return {
        kind: "json",
        value: JSON.stringify({ thought: asJson, meta: sanitizeData(eventData(event)) }, null, 2),
      };
    }
    const meta = sanitizeData(eventData(event));
    if (meta && Object.keys(meta).length > 0) {
      return {
        kind: "json",
        value: JSON.stringify({ thought: event.message, meta }, null, 2),
      };
    }
    return { kind: "text", value: event.message };
  }

  const data = eventData(event);
  if (!data) return null;
  return {
    kind: "json",
    value: JSON.stringify(sanitizeData(data), null, 2),
  };
}
