import type { AgentEvent } from "@/lib/types";

const AGENT_COLOR: Record<string, string> = {
  orchestrator: "#8fa3b8",
  detector: "#3d9cf0",
  log_diver: "#7c6af0",
  hypothesis: "#f0b429",
  mitigator: "#3ecf8e",
  scribe: "#f07178",
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
