import type { AgentEvent } from "@gcp-sre/shared";
import { eventData, tryParseJson } from "@/lib/timeline/json";
import { toolName } from "@/lib/timeline/meta";

const THOUGHT_FALLBACK: Record<string, string> = {
  detector: "Checking Cloud Run patient health signals",
  log_diver: "Planning evidence collection from logs & revisions",
  hypothesis: "Ranking likely root causes",
  mitigator: "Drafting allowlisted remediation proposal",
  scribe: "Writing incident report",
};

function summarizeJson(obj: Record<string, unknown>): string {
  if (Array.isArray(obj.rankedRootCauses)) {
    return `Ranked root causes: ${(obj.rankedRootCauses as string[]).join(", ")}`;
  }
  if (Array.isArray(obj.hypotheses)) {
    const top = obj.hypotheses[0] as { rootCauseLabel?: string; confidence?: number } | undefined;
    if (top?.rootCauseLabel) {
      const pct = top.confidence != null ? ` (${Math.round(top.confidence * 100)}%)` : "";
      return `Top hypothesis: ${top.rootCauseLabel}${pct}`;
    }
    return `Hypotheses: ${(obj.hypotheses as unknown[]).length}`;
  }
  if (typeof obj.summary === "string") return obj.summary;
  if (obj.actions && Array.isArray(obj.actions)) {
    return `Proposed ${(obj.actions as unknown[]).length} remediation action(s)`;
  }
  if (typeof obj.role === "string") return `${obj.role} agent ready`;
  const keys = Object.keys(obj).slice(0, 4).join(", ");
  return keys ? `Structured output (${keys})` : "Structured output";
}

/**
 * Strip markdown noise and keep a long preview of the thought.
 * Numbered lists like "1. tool" must not be treated as sentence ends.
 */
function previewThought(text: string, max = 480): string | null {
  const cleaned = text
    .replace(/\*\*/g, "")
    .replace(/^#+\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  if (/^(allowlisted|action:|incident summary|root cause|rationale|expected outcome)/i.test(cleaned)) {
    return null;
  }
  if ((cleaned.match(/:\s/g) ?? []).length >= 6 && cleaned.includes("{")) return null;

  if (cleaned.length <= max) return cleaned;

  const head = cleaned.slice(0, max);
  const ends = [...head.matchAll(/(?<!\d)[.!?](?=\s|[A-Z]|$)/g)];
  const last = ends[ends.length - 1];
  if (last?.index != null && last.index >= 40) {
    return cleaned.slice(0, last.index + 1);
  }
  const lastSpace = head.lastIndexOf(" ");
  return `${lastSpace > 40 ? head.slice(0, lastSpace) : head}…`;
}

function summarizeThought(agent: string, message: string): string {
  const asJson = tryParseJson(message);
  if (asJson) return summarizeJson(asJson);

  if (agent === "mitigator") {
    const lower = message.toLowerCase();
    if (lower.includes("rollback")) return "Proposing rollback to the last healthy revision";
    if (lower.includes("env")) return "Proposing allowlisted env / traffic remediation";
    return THOUGHT_FALLBACK.mitigator;
  }

  return previewThought(message) ?? THOUGHT_FALLBACK[agent] ?? "Agent analysis";
}

function evidenceSummary(event: AgentEvent): string | null {
  const data = eventData(event);
  if (!data) return null;
  if (typeof data.summary === "string") return data.summary;
  if (data.raw && typeof data.raw === "object" && data.raw !== null && "summary" in data.raw) {
    return String((data.raw as { summary?: string }).summary);
  }
  return null;
}

/** One-line human summary for the collapsed timeline row. */
export function eventSummary(event: AgentEvent): string {
  if (event.type === "tool_call") {
    return `Calling ${toolName(event) ?? "tool"}…`;
  }
  if (event.type === "tool_result") {
    return evidenceSummary(event) ?? event.message;
  }
  if (event.type === "thought") {
    return summarizeThought(event.agent, event.message);
  }
  if (event.type === "status") {
    const asObj = eventData(event);
    if (!asObj) return event.message;
    if (typeof asObj.summary === "string") return asObj.summary;
    if (Array.isArray(asObj.hypotheses) || Array.isArray(asObj.rankedRootCauses)) {
      return summarizeJson(asObj);
    }
  }
  return event.message;
}
