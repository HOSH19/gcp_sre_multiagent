import type { AgentEvent } from "@gcp-sre/shared";

export function eventData(event: AgentEvent): Record<string, unknown> | undefined {
  if (event.data == null || typeof event.data !== "object") return undefined;
  return event.data as Record<string, unknown>;
}

export function tryParseJson(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
