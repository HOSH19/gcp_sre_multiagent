import type { AgentEvent } from "./types";

const AGENT_COLOR: Record<string, string> = {
  orchestrator: "#8fa3b8",
  detector: "#3d9cf0",
  log_diver: "#7c6af0",
  hypothesis: "#f0b429",
  mitigator: "#3ecf8e",
  scribe: "#f07178",
};

const THOUGHT_FALLBACK: Record<string, string> = {
  detector: "Checking Cloud Run patient health signals",
  log_diver: "Planning evidence collection from logs & revisions",
  hypothesis: "Ranking likely root causes",
  mitigator: "Drafting allowlisted remediation proposal",
  scribe: "Writing incident report",
};

export function agentColor(agent: string): string {
  return AGENT_COLOR[agent] ?? "var(--accent)";
}

export function typeLabel(type: string): string {
  switch (type) {
    case "thought":
      return "thinking";
    case "tool_call":
      return "tool →";
    case "tool_result":
      return "← result";
    case "status":
      return "status";
    case "error":
      return "error";
    default:
      return type;
  }
}

export function toolName(event: AgentEvent): string | null {
  if (event.data?.tool) return String(event.data.tool);
  const m = event.message.match(/^(?:Calling|Result from)\s+(\S+)/);
  return m?.[1] ?? null;
}

function tryParseJson(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

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

/** Strip markdown noise and pick one complete sentence — never mid-word cut. */
function firstCompleteSentence(text: string, max = 160): string | null {
  const cleaned = text
    .replace(/\*\*/g, "")
    .replace(/^#+\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;

  // Long markdown / report-style thoughts are not good as summaries.
  if (/^(allowlisted|action:|incident summary|root cause|rationale|expected outcome)/i.test(cleaned)) {
    return null;
  }
  if ((cleaned.match(/:/g) ?? []).length >= 3) return null;

  const match = cleaned.match(/^(.{12,160}?[.!?])(?:\s|$)/);
  if (match) return match[1];
  if (cleaned.length <= max) return cleaned;
  return null;
}

function summarizeThought(agent: string, message: string): string {
  const asJson = tryParseJson(message);
  if (asJson) return summarizeJson(asJson);

  // Prefer a short agent-native label for verbose remediation essays.
  if (agent === "mitigator") {
    const lower = message.toLowerCase();
    if (lower.includes("rollback")) return "Proposing rollback to the last healthy revision";
    if (lower.includes("env")) return "Proposing allowlisted env / traffic remediation";
    return THOUGHT_FALLBACK.mitigator;
  }

  const sentence = firstCompleteSentence(message);
  if (sentence) return sentence;
  return THOUGHT_FALLBACK[agent] ?? "Agent analysis";
}

/** One-line human summary for the collapsed timeline row. */
export function eventSummary(event: AgentEvent): string {
  if (event.type === "tool_call") {
    return `Calling ${toolName(event) ?? "tool"}…`;
  }
  if (event.type === "tool_result") {
    const fromData = evidenceSummary(event);
    if (fromData) return fromData;
    return event.message;
  }
  if (event.type === "thought") {
    return summarizeThought(event.agent, event.message);
  }
  if (event.type === "status" && event.data) {
    const asObj = event.data as Record<string, unknown>;
    if (typeof asObj.summary === "string") return asObj.summary;
    if (Array.isArray(asObj.hypotheses) || Array.isArray(asObj.rankedRootCauses)) {
      return summarizeJson(asObj);
    }
  }
  return event.message;
}

export function evidenceSummary(event: AgentEvent): string | null {
  const data = event.data;
  if (!data) return null;
  if (typeof data.summary === "string") return data.summary;
  if (data.raw && typeof data.raw === "object" && data.raw !== null && "summary" in data.raw) {
    return String((data.raw as { summary?: string }).summary);
  }
  return null;
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
    // Always put the full LLM thought behind Details — never truncate it in the row.
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

export function hasExpandableDetails(event: AgentEvent): boolean {
  return eventDetails(event) != null;
}

function sanitizeData(data: AgentEvent["data"]) {
  if (!data) return data;
  const { raw, ...rest } = data;
  if (raw && typeof raw === "object") return { ...rest, raw };
  return rest;
}
