import { Hono } from "hono";
import type { ScenarioId } from "@gcp-sre/shared";
import { config } from "../config.js";
import { injectAndQueueInvestigation, startInvestigation } from "../orchestrator/index.js";
import { createRun, getRun, saveRun } from "../store/index.js";

export function registerInvestigateRoutes(app: Hono): void {
  app.post("/investigate", async (c) => {
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
}
