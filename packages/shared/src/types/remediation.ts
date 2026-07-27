export type RemediationActionType = "rollback_traffic" | "patch_env";

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
