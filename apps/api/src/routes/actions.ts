import { Hono } from "hono";
import type { ScenarioId } from "@gcp-sre/shared";
import { config } from "../config.js";
import {
  injectAndQueueInvestigation,
  queueApproval,
  startInvestigation,
} from "../orchestrator/index.js";
import {
  cancelActiveSoak,
  getActiveSoak,
  getSoak,
  isSoakBusy,
  startSoak,
} from "../orchestrator/soak.js";
import { createRun, getRun, saveRun } from "../store/index.js";

export function registerActionRoutes(app: Hono): void {
  app.post("/investigate", async (c) => {
    if (await isSoakBusy()) {
      return c.json({ error: "a soak is already running (max concurrent = 1)" }, 409);
    }
    const body = await c.req.json().catch(
      () =>
        ({} as {
          scenario?: ScenarioId;
          inject?: boolean;
          targetService?: string;
          projectId?: string;
          region?: string;
        }),
    );
    try {
      if (body.scenario && body.inject !== false && !body.targetService) {
        return c.json({
          run: await injectAndQueueInvestigation({ scenario: body.scenario, trigger: "manual" }),
        });
      }
      const run = await createRun({
        trigger: "manual",
        scenario: body.scenario,
        targetService: body.targetService ?? config.patientServiceName,
        projectId: body.projectId,
        region: body.region,
      });
      run.status = "queued";
      await saveRun(run);
      void startInvestigation(run.id).catch((err) => {
        console.error(`[investigate] background failure ${run.id}:`, err);
      });
      return c.json({ run: await getRun(run.id) });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 409);
    }
  });

  app.get("/soak", async (c) => {
    const soak = await getActiveSoak();
    return c.json({ soak: soak ?? null, busy: await isSoakBusy() });
  });

  app.post("/soak", async (c) => {
    try {
      return c.json({ soak: await startSoak() }, 202);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 409);
    }
  });

  app.post("/soak/cancel", async (c) => {
    const soak = await cancelActiveSoak();
    if (!soak) return c.json({ error: "no_active_soak" }, 404);
    return c.json({ soak });
  });

  app.get("/soak/:id", async (c) => {
    const soak = await getSoak(c.req.param("id"));
    if (!soak) return c.json({ error: "not_found" }, 404);
    return c.json({ soak });
  });

  app.post("/runs/:id/approve", async (c) => {
    try {
      return c.json({ run: await queueApproval(c.req.param("id"), "approved") });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  app.post("/runs/:id/deny", async (c) => {
    try {
      return c.json({ run: await queueApproval(c.req.param("id"), "denied") });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });
}
