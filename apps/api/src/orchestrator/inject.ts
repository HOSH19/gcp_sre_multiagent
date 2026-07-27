import type { InvestigationRun, ScenarioId } from "@gcp-sre/shared";
import { config } from "../config.js";
import { createRun } from "../store/index.js";
import { startInvestigation } from "./investigate.js";

export async function injectAndInvestigate(opts: {
  scenario: ScenarioId;
  trigger: InvestigationRun["trigger"];
}): Promise<InvestigationRun> {
  const res = await fetch(`${config.chaosControllerUrl}/inject/${opts.scenario}`, {
    method: "POST",
    headers: { "x-chaos-token": config.chaosAdminToken },
  });
  if (!res.ok) throw new Error(`chaos inject failed: ${res.status} ${await res.text()}`);
  const run = createRun({
    trigger: opts.trigger,
    scenario: opts.scenario,
    patientService: config.patientServiceName,
  });
  return startInvestigation(run.id);
}
