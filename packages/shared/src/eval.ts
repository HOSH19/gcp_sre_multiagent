import { canonicalizeRootCause } from "./eval/aliases.js";
import { fuzzyMatchRootCause } from "./eval/fuzzy.js";

/**
 * Eval match: exact for deterministic labels, fuzzy for ReAct free-form text.
 * Prefer `HypothesisItem.canonicalRootCause` when present; this remains the
 * fallback for older runs and free-form labels.
 */
export function matchRootCause(predicted: string, expected: string): boolean {
  if (!predicted || !expected) return false;
  if (predicted === expected) return true;

  const predictedCanon = canonicalizeRootCause(predicted);
  const expectedCanon = canonicalizeRootCause(expected);
  if (predictedCanon === expectedCanon) return true;

  return fuzzyMatchRootCause(predictedCanon, expectedCanon);
}
