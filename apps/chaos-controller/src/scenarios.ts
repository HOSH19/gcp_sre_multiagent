import type { ScenarioId } from "@gcp-sre/shared";
import {
  APP_SECRET_VALUE,
  cloudRunConfig,
  isGcpMode,
  localState,
  MODE,
} from "./config.js";
import { patchServiceEnv, trafficMap } from "./cloudRun.js";
import { patientChaos } from "./patientClient.js";
import {
  ensureAppSecretOnService,
  refreshTrafficFromGcp,
  shiftToBadRevision,
  shiftToGoodRevision,
  syncLocalFromTraffic,
} from "./scenarioTraffic.js";

async function injectMissingConfig(scenario: ScenarioId) {
  await patientChaos("/chaos/reset");
  delete localState.env.APP_SECRET;

  if (!isGcpMode) {
    return {
      status: 200,
      body: { ok: true, scenario, note: "Local mode: APP_SECRET removed from controller state." },
    };
  }

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

async function injectBadRevision(scenario: ScenarioId) {
  await patientChaos("/chaos/reset");
  localState.env.APP_SECRET = localState.env.APP_SECRET || APP_SECRET_VALUE;

  if (!isGcpMode) {
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

  try {
    await ensureAppSecretOnService();
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

export async function injectScenario(scenario: ScenarioId) {
  localState.activeScenario = scenario;

  if (scenario === "missing_config") return injectMissingConfig(scenario);
  return injectBadRevision(scenario);
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
    const patch: Record<string, string | null> = { ...normalized };
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
