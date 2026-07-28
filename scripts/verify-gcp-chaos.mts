import { injectScenario, rollbackTraffic, resetAll, patchEnv } from "../apps/chaos-controller/src/scenarios.js";

const url = process.env.PATIENT_SERVICE_URL!;

async function health() {
  const r = await fetch(`${url}/health`);
  return r.json();
}

async function main() {
  console.log("health before:", await health());

  console.log("\n=== inject bad_revision_traffic ===");
  const inj = await injectScenario("bad_revision_traffic");
  console.log(JSON.stringify(inj, null, 2));
  await new Promise((r) => setTimeout(r, 4000));
  console.log("health after inject:", await health());

  console.log("\n=== rollback ===");
  console.log("traffic:", await rollbackTraffic());
  await new Promise((r) => setTimeout(r, 4000));
  console.log("health after rollback:", await health());

  console.log("\n=== inject missing_config ===");
  const mc = await injectScenario("missing_config");
  console.log(JSON.stringify(mc, null, 2));
  await new Promise((r) => setTimeout(r, 8000));
  console.log("health after missing_config:", await health());

  console.log("\n=== patch env APP_SECRET ===");
  console.log("env:", await patchEnv({ APP_SECRET: "deployed-secret" }));
  await new Promise((r) => setTimeout(r, 8000));
  console.log("health after patch:", await health());

  console.log("\n=== reset ===");
  await resetAll();
  await new Promise((r) => setTimeout(r, 5000));
  console.log("health after reset:", await health());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
