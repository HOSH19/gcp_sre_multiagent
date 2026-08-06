import type { AgentName } from "./agents.js";

/** One timeline / tool event on an investigation run. */
export interface AgentEvent {
  id: string;
  runId: string;
  agent: AgentName;
  type: "thought" | "tool_call" | "tool_result" | "status" | "error";
  message: string;
  data?: unknown;
  at: string;
  costUsdDelta?: number;
  tokensIn?: number;
  tokensOut?: number;
}
