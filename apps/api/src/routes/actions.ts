import { Hono } from "hono";
import type { ScenarioId } from "@gcp-sre/shared";
import { config } from "../config.js";
import {
  injectAndQueueInvestigation,
  queueApproval,
  startInvestigation,
} from "../orchestrator/index.js";
import { createRun, getRun, saveRun } from "../store/index.js";

export function registerActionRoutes(app: Hono): void {
  app.post("/investigate", async (c) => {
    const body = await c.req.json().catch(() => ({} as { scenario?: ScenarioId; inject?: boolean }));
    try {
      if (body.scenario && body.inject !== false) {
        // Return immediately so the web UI can poll live timeline events.
        return c.json({
          run: await injectAndQueueInvestigation({ scenario: body.scenario, trigger: "manual" }),
        });
      }
      const run = createRun({
        trigger: "manual",
        scenario: body.scenario,
        patientService: config.patientServiceName,
      });
      run.status = "queued";
      saveRun(run);
      void startInvestigation(run.id).catch((err) => {
        console.error(`[investigate] background failure ${run.id}:`, err);
      });
      return c.json({ run: getRun(run.id) });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 409);
    }
  });

  app.post("/runs/:id/approve", async (c) => {
    try {
      return c.json({ run: queueApproval(c.req.param("id"), "approved") });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  app.post("/runs/:id/deny", async (c) => {
    try {
      return c.json({ run: queueApproval(c.req.param("id"), "denied") });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });
}
