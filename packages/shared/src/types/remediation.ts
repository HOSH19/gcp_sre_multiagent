/** Action types the platform may execute after approval. */
export const EXECUTABLE_REMEDIATION_ACTIONS = ["rollback_traffic", "patch_env"] as const;
export type ExecutableRemediationAction = (typeof EXECUTABLE_REMEDIATION_ACTIONS)[number];

/**
 * Free-form action type from the LLM / proposal path.
 * Only {@link ExecutableRemediationAction} values are executed; unknown types are propose-only.
 */
export type RemediationActionType = string;

export interface RemediationAction {
  type: RemediationActionType;
  reason: string;
  details: Record<string, string>;
}

export interface RemediationProposal {
  actions: RemediationAction[];
  risk: string;
  summary: string;
}
