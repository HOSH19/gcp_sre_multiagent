export const SPECIALISTS = [
  "detector",
  "log_diver",
  "hypothesis",
  "mitigator",
  "scribe",
] as const;

export type Specialist = (typeof SPECIALISTS)[number];

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
