import type { ScenarioId } from "@gcp-sre/shared";

export const PORT = Number(process.env.PORT ?? process.env.CHAOS_PORT ?? 8082);
export const CHAOS_ADMIN_TOKEN = process.env.CHAOS_ADMIN_TOKEN ?? "dev-chaos-token";
export const PATIENT_SERVICE_URL = process.env.PATIENT_SERVICE_URL ?? "http://127.0.0.1:8081";
export const MODE = process.env.MODE ?? "local";

export const localState = {
  traffic: {} as Record<string, number>,
  env: { APP_SECRET: process.env.APP_SECRET ?? "local-secret" } as Record<string, string>,
  goodRevision: process.env.GOOD_REVISION ?? "patient-good-00001",
  badRevision: process.env.BAD_REVISION ?? "patient-bad-00002",
  activeScenario: null as ScenarioId | null,
};

localState.traffic = { [localState.goodRevision]: 100, [localState.badRevision]: 0 };
