import type { ScenarioId } from "@gcp-sre/shared";
import { api } from "../http.js";
import { usage } from "../usage.js";

export async function cmdInvestigate(args: string[]) {
  let scenario: ScenarioId | undefined;
  let inject = true;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--scenario") scenario = args[++i] as ScenarioId;
    if (args[i] === "--no-inject") inject = false;
  }
  const body = await api("/investigate", { method: "POST", body: JSON.stringify({ scenario, inject }) });
  console.log(`run=${body.run.id} status=${body.run.status}`);
  console.log(`top=${body.run.hypotheses?.[0]?.rootCauseLabel ?? "n/a"}`);
  console.log(`proposal=${body.run.proposedRemediation?.summary ?? "n/a"}`);
}

export async function cmdApprove(id?: string) {
  if (!id) usage();
  const body = await api(`/runs/${id}/approve`, { method: "POST" });
  console.log(`status=${body.run.status} eval=${JSON.stringify(body.run.report?.eval)}`);
  console.log(`health=${JSON.stringify(body.run.report?.healthAfter)}`);
  console.log(`cost=$${body.run.costUsd}`);
}

export async function cmdDeny(id?: string) {
  if (!id) usage();
  const body = await api(`/runs/${id}/deny`, { method: "POST" });
  console.log(`status=${body.run.status}`);
}

export async function cmdReport(id?: string) {
  if (!id) usage();
  const body = await api(`/runs/${id}`);
  console.log(JSON.stringify(body.run.report ?? body.run, null, 2));
}

export async function cmdRuns() {
  const body = await api("/runs");
  for (const run of body.runs) {
    console.log(`${run.id}\t${run.status}\t${run.scenario ?? "-"}\t$${run.costUsd.toFixed(4)}`);
  }
}
