import { Hono } from "hono";
import { getRun, listRuns, listTraces } from "../store/index.js";
import { cancelBusyRun } from "../store/cancelRun.js";

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
    if (!(await cancelBusyRun(run, "cancelled by operator"))) {
      return c.json({ run });
    }
    const updated = await getRun(runId);
    return c.json({ run: updated ?? run });
  });

  app.get("/traces", (c) => c.json({ traces: listTraces() }));
}
