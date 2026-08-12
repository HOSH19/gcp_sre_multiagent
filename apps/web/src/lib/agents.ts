import { AGENT_TOOLS, type Specialist } from "@gcp-sre/shared";

export type { Specialist };

export const SPECIALISTS = Object.keys(AGENT_TOOLS) as Specialist[];

const LABELS: Record<Specialist, string> = {
  detector: "Detector",
  log_diver: "Log diver",
  hypothesis: "Hypothesis",
  mitigator: "Mitigator",
  scribe: "Scribe",
};

export function specialistLabel(agent: Specialist): string {
  return LABELS[agent];
}

export function isSpecialist(agent: string): agent is Specialist {
  return (SPECIALISTS as readonly string[]).includes(agent);
}
