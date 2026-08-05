import {
  EXECUTABLE_REMEDIATION_ACTIONS,
  type ExecutableRemediationAction,
  type RemediationAction,
  type RemediationProposal,
} from "@gcp-sre/shared";

const ALLOWLIST = new Set<string>(EXECUTABLE_REMEDIATION_ACTIONS);

export function isExecutableActionType(type: string): type is ExecutableRemediationAction {
  return ALLOWLIST.has(type);
}

function normalizeAction(raw: unknown): RemediationAction | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const typeRaw =
    typeof obj.type === "string"
      ? obj.type
      : typeof obj.action_type === "string"
        ? obj.action_type
        : typeof obj.actionType === "string"
          ? obj.actionType
          : "";
  const type = typeRaw.trim();
  if (!type) return null;
  const reason = typeof obj.reason === "string" ? obj.reason : "proposed by agent";
  const detailsRaw = obj.details;
  const details: Record<string, string> = {};
  if (detailsRaw && typeof detailsRaw === "object") {
    const rec = detailsRaw as Record<string, unknown>;

    if (type === "patch_env") {
      const environmentVariable =
        typeof rec.environment_variable === "string"
          ? rec.environment_variable
          : typeof rec.environmentVariable === "string"
            ? rec.environmentVariable
            : undefined;
      const environmentValue =
        typeof rec.environment_value === "string"
          ? rec.environment_value
          : typeof rec.value === "string"
            ? rec.value
            : typeof rec.env_value === "string"
              ? rec.env_value
              : undefined;

      if (environmentVariable && environmentValue) {
        details[environmentVariable] = environmentValue;
      } else {
        for (const [k, v] of Object.entries(rec)) {
          if (typeof v === "string") details[k] = v;
          else if (v != null) details[k] = String(v);
        }
      }
    } else {
      for (const [k, v] of Object.entries(rec)) {
        if (typeof v === "string") details[k] = v;
        else if (v != null) details[k] = String(v);
      }
    }
  }
  return { type, reason, details };
}

/**
 * Map an LLM / free-form remediation proposal onto the action policy allowlist.
 * Unknown action types are kept for audit (propose-only) but never executed.
 */
export function mapProposalThroughPolicy(raw: {
  summary?: string;
  risk?: string;
  actions?: unknown[];
}): { proposal: RemediationProposal; executable: RemediationAction[]; proposeOnly: RemediationAction[] } {
  const actions = (raw.actions ?? []).map(normalizeAction).filter((a): a is RemediationAction => Boolean(a));
  const executable = actions.filter((a) => isExecutableActionType(a.type));
  const proposeOnly = actions.filter((a) => !isExecutableActionType(a.type));
  const summary =
    typeof raw.summary === "string" && raw.summary.trim()
      ? raw.summary.trim()
      : executable[0]
        ? `Propose: ${executable.map((a) => a.type).join(", ")}`
        : "No allowlisted remediation actions";
  const risk = typeof raw.risk === "string" && raw.risk.trim() ? raw.risk.trim() : "Unknown — review before approve";

  return {
    proposal: { summary, risk, actions },
    executable,
    proposeOnly,
  };
}

/** Actions safe to run after human approval (allowlisted types only). */
export function executableActionsFromProposal(proposal: RemediationProposal | null): RemediationAction[] {
  if (!proposal) return [];
  return proposal.actions.filter((a) => isExecutableActionType(a.type));
}
