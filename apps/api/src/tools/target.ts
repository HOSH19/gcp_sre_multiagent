import type { InvestigationRun } from "@gcp-sre/shared";
import { config } from "../config.js";
import type { CloudRunServiceRef } from "../gcp/cloudRun.js";

/** Resolve Cloud Run target from an investigation run (falls back to patient config). */
export function serviceRefFromRun(run?: InvestigationRun): CloudRunServiceRef {
  return {
    projectId: run?.projectId ?? config.projectId,
    region: run?.region ?? config.region,
    name: run?.targetService || run?.patientService || config.patientServiceName,
  };
}
