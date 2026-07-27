import { Hono } from "hono";
import type { ScenarioId } from "@gcp-sre/shared";
import { config } from "../config.js";
import { injectAndInvestigate, resolveApproval, startInvestigation } from "../orchestrator/index.js";
import { createRun } from "../store/index.js";

export function registerActionRoutes(app: Hono): void {
  app.post("/investigate", async (c) => {
    const body = await c.req.json().catch(() => ({} as { scenario?: ScenarioId; inject?: boolean }));
    try {
      if (body.scenario && body.inject !== false) {
        return c.json({ run: await injectAndInvestigate({ scenario: body.scenario, trigger: "manual" }) });
      }
      const run = createRun({
        trigger: "manual",
        scenario: body.scenario,
        patientService: config.patientServiceName,
      });
      return c.json({ run: await startInvestigation(run.id) });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 409);
    }
  });

  app.post("/runs/:id/approve", async (c) => {
    try {
      return c.json({ run: await resolveApproval(c.req.param("id"), "approved") });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  app.post("/runs/:id/deny", async (c) => {
    try {
      return c.json({ run: await resolveApproval(c.req.param("id"), "denied") });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });
}
