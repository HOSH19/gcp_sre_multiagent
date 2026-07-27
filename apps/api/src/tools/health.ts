import { config } from "../config.js";
import { chaosState } from "./chaosClient.js";
import { evidence } from "./evidence.js";

type PatientHealth = { ok?: boolean; reason?: string; revision?: string; status: number };

async function fetchPatient(): Promise<PatientHealth> {
  try {
    const res = await fetch(config.patientHealthUrl);
    const body = (await res.json()) as Omit<PatientHealth, "status">;
    return { ...body, status: res.status };
  } catch (err) {
    return { ok: false, reason: `unreachable: ${String(err)}`, status: 0 };
  }
}

function applyChaosOverlay(patient: PatientHealth, state: Awaited<ReturnType<typeof chaosState>>): PatientHealth {
  if (state.activeScenario === "missing_config" && !state.env?.APP_SECRET) {
    return { ok: false, reason: "missing_required_env", status: 503, revision: patient.revision };
  }
  if (state.activeScenario === "bad_revision_traffic") {
    return { ok: false, reason: "unhealthy_revision", status: 503, revision: state.badRevision };
  }
  if (state.activeScenario === "http_500s") {
    return { ok: false, reason: "chaos_force_500", status: 500, revision: patient.revision };
  }
  return patient;
}

export async function getServiceHealth() {
  const state = await chaosState();
  const patient = applyChaosOverlay(await fetchPatient(), state);
  const summary = patient.ok
    ? `Patient healthy (revision=${patient.revision ?? "unknown"})`
    : `Patient unhealthy: ${patient.reason ?? "unknown"} (HTTP ${patient.status})`;
  return evidence("getServiceHealth", summary, { patient, chaosState: state });
}

export async function verifyHealth() {
  return getServiceHealth();
}
