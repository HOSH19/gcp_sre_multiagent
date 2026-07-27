import { Hono } from "hono";
import { isAuthed } from "../auth.js";
import { force500, IS_BAD_REVISION, REQUIRED_CONFIG_KEY, REVISION_LABEL, setForce500 } from "../config.js";

export function registerChaosRoutes(app: Hono): void {
  app.get("/chaos/status", (c) => {
    if (!isAuthed((n) => c.req.header(n))) return c.json({ error: "unauthorized" }, 401);
    return c.json({
      force500,
      isBadRevision: IS_BAD_REVISION,
      revision: REVISION_LABEL,
      hasRequiredConfig: Boolean(process.env[REQUIRED_CONFIG_KEY]),
      requiredKey: REQUIRED_CONFIG_KEY,
    });
  });

  app.post("/chaos/500", async (c) => {
    if (!isAuthed((n) => c.req.header(n))) return c.json({ error: "unauthorized" }, 401);
    const body = await c.req.json().catch(() => ({} as { enabled?: boolean }));
    setForce500(body.enabled ?? true);
    return c.json({ ok: true, force500, scenario: "http_500s" });
  });

  app.post("/chaos/reset", (c) => {
    if (!isAuthed((n) => c.req.header(n))) return c.json({ error: "unauthorized" }, 401);
    setForce500(false);
    return c.json({ ok: true, force500: false });
  });
}
