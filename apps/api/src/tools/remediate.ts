import type { InvestigationRun, RemediationProposal } from "@gcp-sre/shared";
import { config } from "../config.js";
import { chaosFetch } from "./chaosClient.js";

export function proposeRemediation(run: InvestigationRun): RemediationProposal {
  const top = run.hypotheses[0]?.rootCauseLabel;
  const secretValue = process.env.APP_SECRET ?? (config.mode === "gcp" ? "deployed-secret" : "local-secret");
  if (top === "missing_required_env") {
    return {
      summary: "Restore missing APP_SECRET env var on the patient service",
      risk: "Low — config restore; brief restart possible",
      actions: [{ type: "patch_env", reason: "Required configuration missing", details: { APP_SECRET: secretValue } }],
    };
  }
  if (top === "unhealthy_revision_receiving_traffic") {
    return {
      summary: "Rollback traffic to the last healthy revision",
      risk: "Low — traffic shift only, no image rebuild",
      actions: [{ type: "rollback_traffic", reason: "Unhealthy revision receiving traffic", details: { target: "good_revision" } }],
    };
  }
  return {
    summary: "Disable force-500 chaos and ensure traffic stays on healthy revision",
    risk: "Low — toggle chaos flag / confirm env",
    actions: [
      { type: "patch_env", reason: "Clear application fault injection", details: { FORCE_500: "false" } },
      { type: "rollback_traffic", reason: "Ensure healthy revision serves traffic", details: { target: "good_revision" } },
    ],
  };
}

export async function rollbackTraffic() {
  const res = await chaosFetch("/remediate/rollback", { method: "POST" });
  return { ok: res.status < 300, detail: JSON.stringify(res.body) };
}

export async function patchEnvVars(vars: Record<string, string>) {
  if (vars.FORCE_500 === "false") await chaosFetch("/reset", { method: "POST" });
  const res = await chaosFetch("/remediate/patch-env", { method: "POST", body: JSON.stringify(vars) });
  return { ok: res.status < 300, detail: JSON.stringify(res.body) };
}
