import { Hono } from "hono";
import type { ScenarioId } from "@gcp-sre/shared";
import { isAuthed } from "./auth.js";
import { localState, MODE, PATIENT_SERVICE_URL } from "./config.js";
import { injectScenario, patchEnv, resetAll, rollbackTraffic } from "./scenarios.js";

const VALID: ScenarioId[] = ["http_500s", "missing_config", "bad_revision_traffic"];

export function registerRoutes(app: Hono): void {
  app.get("/health", (c) => c.json({ ok: true, service: "chaos-controller", mode: MODE }));

  app.get("/state", (c) => {
    if (!isAuthed((n) => c.req.header(n))) return c.json({ error: "unauthorized" }, 401);
    return c.json({ mode: MODE, ...localState, patientServiceUrl: PATIENT_SERVICE_URL });
  });

  app.post("/inject/:scenario", async (c) => {
    if (!isAuthed((n) => c.req.header(n))) return c.json({ error: "unauthorized" }, 401);
    const scenario = c.req.param("scenario") as ScenarioId;
    if (!VALID.includes(scenario)) return c.json({ error: "unknown_scenario", scenario }, 400);
    const result = await injectScenario(scenario);
    return c.json({ ok: true, scenario, result, state: localState }, result.status >= 400 ? 502 : 200);
  });

  app.post("/reset", async (c) => {
    if (!isAuthed((n) => c.req.header(n))) return c.json({ error: "unauthorized" }, 401);
    return c.json({ ok: true, result: await resetAll() });
  });

  app.post("/remediate/rollback", (c) => {
    if (!isAuthed((n) => c.req.header(n))) return c.json({ error: "unauthorized" }, 401);
    return c.json({ ok: true, traffic: rollbackTraffic() });
  });

  app.post("/remediate/patch-env", async (c) => {
    if (!isAuthed((n) => c.req.header(n))) return c.json({ error: "unauthorized" }, 401);
    const body = await c.req.json().catch(() => ({} as Record<string, string>));
    return c.json({ ok: true, env: patchEnv(body) });
  });
}
