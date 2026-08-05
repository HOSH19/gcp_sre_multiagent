import type { InvestigationRun } from "@gcp-sre/shared";

/** Context passed to every registered tool handler via runTool. */
export interface ToolCallContext {
  run: InvestigationRun;
  /** Tool-specific args (Scribe requires decision/cost from the orchestrator). */
  args?: Record<string, unknown>;
}

export type ToolHandler = (ctx: ToolCallContext) => Promise<unknown>;
