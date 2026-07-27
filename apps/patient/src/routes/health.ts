import { Hono } from "hono";
import { force500, IS_BAD_REVISION, REQUIRED_CONFIG_KEY, REVISION_LABEL } from "../config.js";

function missingConfig(): boolean {
  return !process.env[REQUIRED_CONFIG_KEY];
}

export function registerHealthRoutes(app: Hono): void {
  app.get("/health", (c) => {
    if (missingConfig()) {
      return c.json({ ok: false, reason: "missing_required_env", key: REQUIRED_CONFIG_KEY, revision: REVISION_LABEL }, 503);
    }
    if (IS_BAD_REVISION) {
      return c.json({ ok: false, reason: "unhealthy_revision", revision: REVISION_LABEL }, 503);
    }
    if (force500) {
      return c.json({ ok: false, reason: "chaos_force_500", revision: REVISION_LABEL }, 500);
    }
    return c.json({ ok: true, revision: REVISION_LABEL, service: "patient" });
  });

  app.get("/", (c) => {
    if (missingConfig()) return c.json({ error: "misconfigured", key: REQUIRED_CONFIG_KEY }, 500);
    if (IS_BAD_REVISION) return c.json({ error: "bad_revision", revision: REVISION_LABEL }, 500);
    if (force500) return c.json({ error: "forced_500", revision: REVISION_LABEL }, 500);
    return c.json({ message: "patient ok", revision: REVISION_LABEL, force500 });
  });
}
