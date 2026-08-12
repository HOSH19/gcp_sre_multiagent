import type { InvestigationRun, RemediationAction } from "@gcp-sre/shared";
import { proposeRemediation as deterministicProposal } from "../tools/remediate.js";
import { isMissingRequiredEnv } from "./rootCause.js";
import { executableActionsFromProposal, isExecutableActionType } from "./policy.js";

function canonicalizePatchEnv(
  action: RemediationAction,
  run: InvestigationRun,
  fallbackDetails: Record<string, string>,
): RemediationAction {
  if (action.type !== "patch_env") return action;

  const malformedAlias = action.details.environment_variable;
  const needsCanonicalPatch =
    !Object.keys(action.details).length ||
    Boolean(malformedAlias) ||
    "action_type" in action.details ||
    (isMissingRequiredEnv(run) && !("APP_SECRET" in action.details));

  if (!needsCanonicalPatch) return action;
  return { ...action, details: { ...fallbackDetails } };
}

/** Normalize proposal actions through the allowlist and common LLM shape mistakes. */
export function normalizeExecutableActions(run: InvestigationRun): {
  executable: RemediationAction[];
  skipped: RemediationAction[];
} {
  const proposal = run.proposedRemediation;
  if (!proposal) throw new Error("no remediation proposal");

  const executable = executableActionsFromProposal(proposal);
  const skipped = proposal.actions.filter((a) => !isExecutableActionType(a.type));
  const fallback = executableActionsFromProposal(deterministicProposal(run));
  const fallbackByType = new Map(fallback.map((action) => [action.type, action]));

  const normalized = executable.map((action) => {
    const fallbackAction = fallbackByType.get(action.type);
    return canonicalizePatchEnv(action, run, fallbackAction?.details ?? {});
  });

  return { executable: normalized, skipped };
}
