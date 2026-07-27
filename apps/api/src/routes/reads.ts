import { Hono } from "hono";
import { getRun, listRuns, listTraces } from "../store/index.js";

export function registerReadRoutes(app: Hono): void {
  app.get("/runs", (c) => c.json({ runs: listRuns() }));
  app.get("/runs/:id", (c) => {
    const run = getRun(c.req.param("id"));
    if (!run) return c.json({ error: "not_found" }, 404);
    return c.json({ run });
  });
  app.get("/traces", (c) => c.json({ traces: listTraces() }));
}
