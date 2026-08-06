import {
  APP_SECRET_VALUE,
  cloudRunConfig,
  localState,
} from "./config.js";
import { getService, patchServiceEnv, trafficMap, updateTraffic } from "./cloudRun.js";

export function syncLocalFromTraffic(traffic: Record<string, number>) {
  localState.traffic = traffic;
}

export async function shiftToBadRevision() {
  const result = await updateTraffic(cloudRunConfig, [
    { revision: localState.badRevision, percent: 100 },
    { revision: localState.goodRevision, percent: 0 },
  ]);
  syncLocalFromTraffic(result.traffic);
  return result;
}

export async function shiftToGoodRevision() {
  const result = await updateTraffic(cloudRunConfig, [
    { revision: localState.goodRevision, percent: 100 },
    { revision: localState.badRevision, percent: 0 },
  ]);
  syncLocalFromTraffic(result.traffic);
  return result;
}

export async function refreshTrafficFromGcp() {
  try {
    const service = await getService(cloudRunConfig);
    syncLocalFromTraffic(trafficMap(service));
  } catch {
    /* best-effort */
  }
}

export async function ensureAppSecretOnService() {
  const env = (await getService(cloudRunConfig)).template?.containers?.[0]?.env ?? [];
  const hasSecret = env.some((e) => e.name === "APP_SECRET" && e.value);
  if (!hasSecret) {
    await patchServiceEnv(cloudRunConfig, { APP_SECRET: APP_SECRET_VALUE, IS_BAD_REVISION: null });
  }
}
