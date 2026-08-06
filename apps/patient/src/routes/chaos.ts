import { Hono } from "hono";
import { isAuthed } from "../auth.js";
import { IS_BAD_REVISION, REQUIRED_CONFIG_KEY, REVISION_LABEL } from "../config.js";

export function registerChaosRoutes(app: Hono): void {
  app.get("/chaos/status", (c) => {
    if (!isAuthed((n) => c.req.header(n))) return c.json({ error: "unauthorized" }, 401);
    return c.json({
      isBadRevision: IS_BAD_REVISION,
      revision: REVISION_LABEL,
      hasRequiredConfig: Boolean(process.env[REQUIRED_CONFIG_KEY]),
      requiredKey: REQUIRED_CONFIG_KEY,
    });
  });

  app.post("/chaos/reset", (c) => {
    if (!isAuthed((n) => c.req.header(n))) return c.json({ error: "unauthorized" }, 401);
    return c.json({ ok: true });
  });
}
