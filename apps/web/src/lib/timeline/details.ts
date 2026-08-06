import type { AgentEvent } from "@/lib/types";
import { tryParseJson } from "@/lib/timeline/json";

function sanitizeData(data: AgentEvent["data"]) {
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
        value: JSON.stringify({ thought: asJson, meta: sanitizeData(event.data) }, null, 2),
      };
    }
    const meta = sanitizeData(event.data);
    if (meta && Object.keys(meta).length > 0) {
      return {
        kind: "json",
        value: JSON.stringify({ thought: event.message, meta }, null, 2),
      };
    }
    return { kind: "text", value: event.message };
  }

  if (!event.data) return null;
  return {
    kind: "json",
    value: JSON.stringify(sanitizeData(event.data), null, 2),
  };
}
