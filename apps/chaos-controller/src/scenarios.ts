import type { ScenarioId } from "@gcp-sre/shared";
import {
  APP_SECRET_VALUE,
  cloudRunConfig,
  isGcpMode,
  localState,
  MODE,
} from "./config.js";
import { getService, patchServiceEnv, trafficMap, updateTraffic } from "./cloudRun.js";
import { patientChaos } from "./patientClient.js";

function syncLocalFromTraffic(traffic: Record<string, number>) {
  localState.traffic = traffic;
}

async function shiftToBadRevision() {
  const result = await updateTraffic(cloudRunConfig, [
    { revision: localState.badRevision, percent: 100 },
    { revision: localState.goodRevision, percent: 0 },
  ]);
  syncLocalFromTraffic(result.traffic);
  return result;
}

async function shiftToGoodRevision() {
  const result = await updateTraffic(cloudRunConfig, [
    { revision: localState.goodRevision, percent: 100 },
    { revision: localState.badRevision, percent: 0 },
  ]);
  syncLocalFromTraffic(result.traffic);
  return result;
}

async function refreshTrafficFromGcp() {
  try {
    const service = await getService(cloudRunConfig);
    syncLocalFromTraffic(trafficMap(service));
  } catch {
    /* best-effort */
  }
}

export async function injectScenario(scenario: ScenarioId) {
  localState.activeScenario = scenario;

  if (scenario === "http_500s") {
    localState.traffic = { [localState.goodRevision]: 100, [localState.badRevision]: 0 };
    localState.env.APP_SECRET = localState.env.APP_SECRET || APP_SECRET_VALUE;
    if (isGcpMode) {
      try {
        await shiftToGoodRevision();
      } catch (err) {
        return {
          status: 502,
          body: { ok: false, scenario, error: `failed to pin good revision: ${String(err)}` },
        };
      }
    }
    return patientChaos("/chaos/500", { enabled: true });
  }

  if (scenario === "missing_config") {
    await patientChaos("/chaos/reset");
    delete localState.env.APP_SECRET;

    if (isGcpMode) {
      try {
        const result = await patchServiceEnv(cloudRunConfig, {
          APP_SECRET: null,
          IS_BAD_REVISION: null,
        });
        localState.env = { ...result.env };
        if (result.latestRevision) {
          syncLocalFromTraffic(trafficMap(result.service));
        }
        return {
          status: 200,
          body: {
            ok: true,
            scenario,
            env: localState.env,
            note: "GCP: removed APP_SECRET from patient Cloud Run service (new revision).",
          },
        };
      } catch (err) {
        return { status: 502, body: { ok: false, scenario, error: String(err) } };
      }
    }

    return {
      status: 200,
      body: { ok: true, scenario, note: "Local mode: APP_SECRET removed from controller state." },
    };
  }

  await patientChaos("/chaos/reset");
  localState.env.APP_SECRET = localState.env.APP_SECRET || APP_SECRET_VALUE;

  if (isGcpMode) {
    try {
      const env = (await getService(cloudRunConfig)).template?.containers?.[0]?.env ?? [];
      const hasSecret = env.some((e) => e.name === "APP_SECRET" && e.value);
      if (!hasSecret) {
        await patchServiceEnv(cloudRunConfig, { APP_SECRET: APP_SECRET_VALUE, IS_BAD_REVISION: null });
      }
      const result = await shiftToBadRevision();
      return {
        status: 200,
        body: {
          ok: true,
          scenario,
          traffic: result.traffic,
          goodRevision: localState.goodRevision,
          badRevision: localState.badRevision,
          note: "GCP: shifted Cloud Run traffic to bad revision",
        },
      };
    } catch (err) {
      return { status: 502, body: { ok: false, scenario, error: String(err) } };
    }
  }

  localState.traffic = { [localState.goodRevision]: 0, [localState.badRevision]: 100 };
  return {
    status: 200,
    body: {
      ok: true,
      scenario,
      traffic: localState.traffic,
      note: "Local mode: traffic on bad revision",
    },
  };
}

export async function resetAll() {
  localState.activeScenario = null;
  localState.traffic = { [localState.goodRevision]: 100, [localState.badRevision]: 0 };
  localState.env.APP_SECRET = APP_SECRET_VALUE;

  const patient = await patientChaos("/chaos/reset");

  if (isGcpMode) {
    try {
      await patchServiceEnv(cloudRunConfig, {
        APP_SECRET: APP_SECRET_VALUE,
        IS_BAD_REVISION: null,
        FORCE_500: null,
      });
      try {
        await shiftToGoodRevision();
      } catch {
        await refreshTrafficFromGcp();
      }
    } catch (err) {
      return {
        patient,
        localState,
        gcpError: String(err),
        mode: MODE,
      };
    }
  }

  return { patient, localState, mode: MODE };
}

export async function rollbackTraffic() {
  if (isGcpMode) {
    const result = await shiftToGoodRevision();
    if (localState.activeScenario === "bad_revision_traffic") localState.activeScenario = null;
    return result.traffic;
  }
  localState.traffic = { [localState.goodRevision]: 100, [localState.badRevision]: 0 };
  if (localState.activeScenario === "bad_revision_traffic") localState.activeScenario = null;
  return localState.traffic;
}

export async function patchEnv(vars: Record<string, string>) {
  const normalized = { ...vars };
  if (normalized.APP_SECRET && isGcpMode) {
    normalized.APP_SECRET = APP_SECRET_VALUE;
  }
  Object.assign(localState.env, normalized);

  if (isGcpMode) {
    const patch: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(normalized)) {
      if (k === "FORCE_500" && (v === "false" || v === "0")) {
        patch.FORCE_500 = null;
        continue;
      }
      patch[k] = v;
    }
    const result = await patchServiceEnv(cloudRunConfig, patch);
    localState.env = { ...result.env };
    if (result.latestRevision && normalized.APP_SECRET) {
      localState.goodRevision = result.latestRevision;
      process.env.GOOD_REVISION = result.latestRevision;
    }
    syncLocalFromTraffic(trafficMap(result.service));
  }

  if (localState.activeScenario === "missing_config" && localState.env.APP_SECRET) {
    localState.activeScenario = null;
  }
  return localState.env;
}
