import { Hono } from "hono";
import { config } from "../config.js";
import { getActiveRunId } from "../store/index.js";
import { SCENARIOS } from "@gcp-sre/shared";

export function registerMetaRoutes(app: Hono): void {
  app.get("/health", (c) =>
    c.json({ ok: true, service: "api", mode: config.mode, activeRunId: getActiveRunId() }),
  );
  app.get("/scenarios", (c) => c.json({ scenarios: Object.values(SCENARIOS) }));
}
