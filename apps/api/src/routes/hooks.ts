import { Hono } from "hono";
import type { ScenarioId } from "@gcp-sre/shared";
import { findActiveRunForTarget, mapAlertFromPubSub, type PubSubEnvelope } from "../fleet/index.js";
import { startInvestigation } from "../orchestrator/index.js";
import { appendEvent, createRun, saveRun } from "../store/index.js";

export function registerHookRoutes(app: Hono): void {
  app.post("/hooks/pubsub", async (c) => {
    const envelope = (await c.req.json().catch(() => null)) as PubSubEnvelope | null;
    try {
      const alert = await mapAlertFromPubSub(envelope);
      const { name, projectId, region } = alert.service;

      const existing = await findActiveRunForTarget({
        targetService: name,
        projectId,
        region,
      });

      if (existing) {
        existing.alert = alert;
        await saveRun(existing);
        await appendEvent(existing.id, {
          agent: "orchestrator",
          type: "status",
          message: `Correlated alert attached (incident=${alert.incidentId ?? "n/a"}, condition=${alert.condition ?? "n/a"})`,
          data: { alert, correlated: true },
        });
        return c.json({
          ok: true,
          correlated: true,
          runId: existing.id,
          run: existing,
        });
      }

      const run = await createRun({
        trigger: "alert",
        scenario: alert.scenario as ScenarioId | undefined,
        targetService: name,
        projectId,
        region,
        alert,
      });
      await appendEvent(run.id, {
        agent: "orchestrator",
        type: "status",
        message: `Alert ingested for ${projectId}/${region}/${name}` +
          (alert.condition ? ` (condition=${alert.condition})` : ""),
        data: { alert },
      });
      return c.json({ ok: true, correlated: false, run: await startInvestigation(run.id) });
    } catch (err) {
      return c.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 200);
    }
  });
}
