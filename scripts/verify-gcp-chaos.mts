import { injectScenario, patchEnv, resetAll, rollbackTraffic } from "../apps/chaos-controller/src/scenarios.js";

const url = process.env.PATIENT_SERVICE_URL!;

async function health(): Promise<unknown> {
  const r = await fetch(`${url}/health`);
  return r.json();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runStep(label: string, action: () => Promise<unknown>, waitMs: number): Promise<void> {
  console.log(`\n=== ${label} ===`);
  console.log(await action());
  await sleep(waitMs);
  console.log(`health after ${label}:`, await health());
}

async function main(): Promise<void> {
  console.log("health before:", await health());

  await runStep(
    "inject bad_revision_traffic",
    () => injectScenario("bad_revision_traffic").then((result) => JSON.stringify(result, null, 2)),
    4000,
  );
  await runStep("rollback", () => rollbackTraffic().then((traffic) => `traffic: ${JSON.stringify(traffic)}`), 4000);
  await runStep(
    "inject missing_config",
    () => injectScenario("missing_config").then((result) => JSON.stringify(result, null, 2)),
    8000,
  );
  await runStep(
    "patch env APP_SECRET",
    () => patchEnv({ APP_SECRET: "deployed-secret" }).then((env) => `env: ${JSON.stringify(env)}`),
    8000,
  );

  console.log("\n=== reset ===");
  await resetAll();
  await sleep(5000);
  console.log("health after reset:", await health());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
