import type { Specialist } from "@gcp-sre/shared";
import { config } from "../config.js";

const FLASH_AGENTS = new Set<Specialist>([
  "detector",
  "log_diver",
  "hypothesis",
  "mitigator",
  "scribe",
]);

/** Vertex model per specialist — flash for ReAct function-calling agents. */
export function modelFor(agent: Specialist): string {
  return FLASH_AGENTS.has(agent) ? config.flashModel : config.flashLiteModel;
}
