/** Soft caps enforced every ReAct / tool step. Raised carefully for multi-turn loops. */
export const RUN_CAPS = {
  maxSteps: 36,
  maxWallMs: 8 * 60 * 1000,
  maxCostUsd: 0.75,
  maxToolCalls: 56,
  maxConcurrentRuns: 1,
} as const;
