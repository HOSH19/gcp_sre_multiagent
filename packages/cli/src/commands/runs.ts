import { SCENARIOS, type ScenarioId } from "@gcp-sre/shared";
import { api } from "../http.js";
import { usage } from "../usage.js";

function parseInvestigateArgs(args: string[]): { scenario?: ScenarioId; inject: boolean } {
  let scenario: ScenarioId | undefined;
  let inject = true;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--scenario") {
      const value = args[++i];
      if (!value || !(value in SCENARIOS)) usage();
      scenario = value as ScenarioId;
    }
    if (args[i] === "--no-inject") inject = false;
  }
  return { scenario, inject };
}

/** Start an investigation (optionally with scenario inject). */
export async function cmdInvestigate(args: string[]) {
  const { scenario, inject } = parseInvestigateArgs(args);
  const body = await api("/investigate", { method: "POST", body: JSON.stringify({ scenario, inject }) });
  const run = body.run;
  if (!run) throw new Error("investigate response missing run");
  console.log(`run=${run.id} status=${run.status}`);
  console.log(`top=${run.hypotheses?.[0]?.rootCauseLabel ?? "n/a"}`);
  console.log(`proposal=${run.proposedRemediation?.summary ?? "n/a"}`);
}

/** Approve a pending remediation. */
export async function cmdApprove(id?: string) {
  if (!id) usage();
  const body = await api(`/runs/${id}/approve`, { method: "POST" });
  const run = body.run;
  if (!run) throw new Error("approve response missing run");
  console.log(`status=${run.status} eval=${JSON.stringify(run.report?.eval)}`);
  console.log(`health=${JSON.stringify(run.report?.healthAfter)}`);
  console.log(`cost=$${run.costUsd}`);
}

/** Deny a pending remediation. */
export async function cmdDeny(id?: string) {
  if (!id) usage();
  const body = await api(`/runs/${id}/deny`, { method: "POST" });
  console.log(`status=${body.run?.status}`);
}

/** Print a run report (or the run itself). */
export async function cmdReport(id?: string) {
  if (!id) usage();
  const body = await api(`/runs/${id}`);
  console.log(JSON.stringify(body.run?.report ?? body.run, null, 2));
}

/** List recent runs. */
export async function cmdRuns() {
  const body = await api("/runs");
  for (const run of body.runs ?? []) {
    console.log(`${run.id}\t${run.status}\t${run.scenario ?? "-"}\t$${run.costUsd.toFixed(4)}`);
  }
}
