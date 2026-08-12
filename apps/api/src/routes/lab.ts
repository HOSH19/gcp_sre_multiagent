import { Hono } from "hono";
import { resetLab } from "../orchestrator/labReset.js";

export function registerLabRoutes(app: Hono): void {
  app.post("/reset-lab", async (c) => {
    try {
      return c.json(await resetLab());
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });
}
