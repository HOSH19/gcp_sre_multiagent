import { Hono } from "hono";
import { queueApproval } from "../orchestrator/index.js";

export function registerApprovalRoutes(app: Hono): void {
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
