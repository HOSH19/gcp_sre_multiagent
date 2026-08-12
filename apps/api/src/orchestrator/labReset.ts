import type { InvestigationRun } from "@gcp-sre/shared";
import { config } from "../config.js";
import { resetChaosController } from "../tools/chaosClient.js";
import { CANCELLABLE_STATUSES, cancelBusyRun } from "../store/cancelRun.js";
import { listRuns, releaseAllInvestigationLeases } from "../store/index.js";

export interface ResetLabResult {
  ok: true;
  chaosReset: boolean;
  runsCleared: string[];
  leasesReleased: boolean;
}

export function isPatientBusyRun(run: InvestigationRun, patientService: string): boolean {
  const name = run.targetService || run.patientService;
  return name === patientService && CANCELLABLE_STATUSES.has(run.status);
}

/** Reset chaos lab state and clear stuck investigation slots for the default patient. */
export async function resetLab(patientService = config.patientServiceName): Promise<ResetLabResult> {
  let chaosReset = false;
  try {
    chaosReset = await resetChaosController();
  } catch (err) {
    console.error("[reset-lab] chaos reset failed:", err);
  }

  const runsCleared: string[] = [];
  for (const run of await listRuns()) {
    if (!isPatientBusyRun(run, patientService)) continue;
    if (await cancelBusyRun(run, "operator: lab reset before investigate")) {
      runsCleared.push(run.id);
    }
  }

  await releaseAllInvestigationLeases();

  return { ok: true, chaosReset, runsCleared, leasesReleased: true };
}
