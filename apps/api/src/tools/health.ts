import { config } from "../config.js";
import { chaosState } from "./chaosClient.js";
import { evidence } from "./evidence.js";

type PatientHealth = { ok?: boolean; reason?: string; revision?: string; status: number };
type ChaosSnapshot = Awaited<ReturnType<typeof chaosState>>;

async function fetchPatient(): Promise<PatientHealth> {
  try {
    const res = await fetch(config.patientHealthUrl);
    const body = (await res.json()) as Omit<PatientHealth, "status">;
    return { ...body, status: res.status };
  } catch (err) {
    return { ok: false, reason: `unreachable: ${String(err)}`, status: 0 };
  }
}

/** Local/dev only: chaos-controller in-memory state does not mutate the patient process. */
function applyChaosOverlay(patient: PatientHealth, state: ChaosSnapshot): PatientHealth {
  if (state.activeScenario === "missing_config" && !state.env?.APP_SECRET) {
    return { ok: false, reason: "missing_required_env", status: 503, revision: patient.revision };
  }
  if (state.activeScenario === "bad_revision_traffic") {
    return { ok: false, reason: "unhealthy_revision", status: 503, revision: state.badRevision };
  }
  return patient;
}

function chaosBlocksHealth(state: ChaosSnapshot): boolean {
  if (state.activeScenario === "missing_config" && !state.env?.APP_SECRET) return true;
  if (state.activeScenario === "bad_revision_traffic") return true;
  return false;
}

function healthSummary(patient: PatientHealth, state: ChaosSnapshot): string {
  if (patient.ok && !chaosBlocksHealth(state)) {
    return `Patient healthy (revision=${patient.revision ?? "unknown"})`;
  }
  let summary = `Patient unhealthy: ${patient.reason ?? "unknown"} (HTTP ${patient.status})`;
  if (state.activeScenario) {
    summary += ` — active chaos scenario=${state.activeScenario}`;
  } else if (config.mode === "gcp") {
    summary += " — prior chaos may have left bad state; run reset if unexpected";
  }
  return summary;
}

function resolvePatient(patientRaw: PatientHealth, state: ChaosSnapshot): PatientHealth {
  return config.mode === "gcp" ? patientRaw : applyChaosOverlay(patientRaw, state);
}

/** True when patient and chaos-controller state both reflect a recovered service. */
export function isPostRemediationHealthy(patient: PatientHealth, state: ChaosSnapshot): boolean {
  if (config.mode === "gcp") return Boolean(patient.ok);
  return Boolean(patient.ok) && !chaosBlocksHealth(state);
}

async function snapshotHealth(): Promise<{ patient: PatientHealth; state: ChaosSnapshot; summary: string }> {
  const state = await chaosState();
  const patientRaw = await fetchPatient();
  const patient = resolvePatient(patientRaw, state);
  return { patient, state, summary: healthSummary(patient, state) };
}

export function healthEvidenceOk(health: unknown): { ok: boolean; detail: string } {
  const item = health as {
    summary?: string;
    raw?: { patient?: PatientHealth; chaosState?: ChaosSnapshot };
  };
  const patient = item.raw?.patient;
  const state = item.raw?.chaosState ?? {};
  const ok = patient ? isPostRemediationHealthy(patient, state) : false;
  return { ok, detail: item.summary ?? "Post-remediation health unknown" };
}

export async function getServiceHealth() {
  const { patient, state, summary } = await snapshotHealth();
  return evidence("getServiceHealth", summary, {
    patient,
    chaosState: state,
    mode: config.mode,
  });
}

/** Post-remediation health: poll until patient and chaos state both reflect recovery. */
export async function verifyHealth() {
  const attempts = config.mode === "gcp" ? 12 : 6;
  const delayMs = 2000;

  let snapshot = await snapshotHealth();
  for (let i = 0; i < attempts; i++) {
    if (isPostRemediationHealthy(snapshot.patient, snapshot.state)) break;
    await new Promise((r) => setTimeout(r, delayMs));
    snapshot = await snapshotHealth();
  }

  return evidence("verifyHealth", snapshot.summary, {
    patient: snapshot.patient,
    chaosState: snapshot.state,
    mode: config.mode,
  });
}
