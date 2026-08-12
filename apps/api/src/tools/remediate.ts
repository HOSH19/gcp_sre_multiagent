import type { InvestigationRun, RemediationProposal } from "@gcp-sre/shared";
import { config } from "../config.js";
import {
  isMissingRequiredEnv,
  isUnhealthyRevisionTraffic,
} from "../orchestrator/rootCause.js";
import { chaosFetch } from "./chaosClient.js";

export function proposeRemediation(run: InvestigationRun): RemediationProposal {
  const secretValue = process.env.APP_SECRET ?? (config.mode === "gcp" ? "deployed-secret" : "local-secret");
  if (isMissingRequiredEnv(run)) {
    return {
      summary: "Restore missing APP_SECRET env var on the patient service",
      risk: "Low — config restore; brief restart possible",
      actions: [{ type: "patch_env", reason: "Required configuration missing", details: { APP_SECRET: secretValue } }],
    };
  }
  if (isUnhealthyRevisionTraffic(run)) {
    return {
      summary: "Rollback traffic to the last healthy revision",
      risk: "Low — traffic shift only, no image rebuild",
      actions: [{ type: "rollback_traffic", reason: "Unhealthy revision receiving traffic", details: { target: "good_revision" } }],
    };
  }
  return {
    summary: "No allowlisted remediation for unrecognized root cause — manual review",
    risk: "Unknown — do not auto-mutate without operator judgment",
    actions: [],
  };
}

export async function rollbackTraffic() {
  const res = await chaosFetch("/remediate/rollback", { method: "POST" });
  return { ok: res.status < 300, detail: JSON.stringify(res.body) };
}

export async function patchEnvVars(vars: Record<string, string>) {
  const res = await chaosFetch("/remediate/patch-env", { method: "POST", body: JSON.stringify(vars) });
  return { ok: res.status < 300, detail: JSON.stringify(res.body) };
}
