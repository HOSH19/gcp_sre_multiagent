import type { ScenarioId } from "@gcp-sre/shared";

export const PORT = Number(process.env.PORT ?? process.env.CHAOS_PORT ?? 8082);
export const CHAOS_ADMIN_TOKEN = process.env.CHAOS_ADMIN_TOKEN ?? "dev-chaos-token";
export const PATIENT_SERVICE_URL = process.env.PATIENT_SERVICE_URL ?? "http://127.0.0.1:8081";
export const MODE = (process.env.MODE ?? "local") as "local" | "gcp";

export const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT ?? "sre-multiagent";
export const GCP_REGION = process.env.GCP_REGION ?? "us-central1";
export const PATIENT_SERVICE_NAME = process.env.PATIENT_SERVICE_NAME ?? "patient";
/** Known-good APP_SECRET restored by remediation / reset in GCP mode. */
export const APP_SECRET_VALUE = process.env.APP_SECRET ?? "local-secret";

/** Real Cloud Run mutations when MODE=gcp (deploy sets this). Local keeps in-memory theater. */
export const isGcpMode = MODE === "gcp";

export const cloudRunConfig = {
  projectId: GCP_PROJECT_ID,
  region: GCP_REGION,
  serviceName: PATIENT_SERVICE_NAME,
};

export const localState = {
  traffic: {} as Record<string, number>,
  env: { APP_SECRET: APP_SECRET_VALUE } as Record<string, string>,
  goodRevision: process.env.GOOD_REVISION ?? "patient-good-00001",
  badRevision: process.env.BAD_REVISION ?? "patient-bad-00002",
  activeScenario: null as ScenarioId | null,
};

localState.traffic = { [localState.goodRevision]: 100, [localState.badRevision]: 0 };
