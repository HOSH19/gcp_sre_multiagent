import { Hono } from "hono";
import { getRun, listRuns, listTraces, releaseLock, saveRun } from "../store/index.js";

const CANCELLABLE = new Set(["queued", "running", "awaiting_approval", "remediating"]);

export function registerReadRoutes(app: Hono): void {
  app.get("/runs", async (c) => c.json({ runs: await listRuns() }));
  app.get("/runs/:id", async (c) => {
    const run = await getRun(c.req.param("id"));
    if (!run) return c.json({ error: "not_found" }, 404);
    return c.json({ run });
  });

  app.post("/runs/:id/cancel", async (c) => {
    const runId = c.req.param("id");
    const run = await getRun(runId);
    if (!run) return c.json({ error: "not_found" }, 404);
    if (!CANCELLABLE.has(run.status)) {
      return c.json({ run });
    }
    run.status = "failed";
    run.error = "cancelled by operator";
    run.updatedAt = new Date().toISOString();
    await saveRun(run);
    await releaseLock(runId);
    const updated = await getRun(runId);
    return c.json({ run: updated ?? run });
  });

  app.get("/traces", (c) => c.json({ traces: listTraces() }));
}
