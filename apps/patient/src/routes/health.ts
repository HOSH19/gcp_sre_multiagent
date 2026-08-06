import { Hono } from "hono";
import { IS_BAD_REVISION, REQUIRED_CONFIG_KEY, REVISION_LABEL } from "../config.js";

function missingConfig(): boolean {
  return !process.env[REQUIRED_CONFIG_KEY];
}

type Failure = { status: 500 | 503; body: Record<string, unknown> };

function failureReason(): Failure | null {
  if (missingConfig()) {
    return {
      status: 503,
      body: { ok: false, reason: "missing_required_env", key: REQUIRED_CONFIG_KEY, revision: REVISION_LABEL },
    };
  }
  if (IS_BAD_REVISION) {
    return {
      status: 503,
      body: { ok: false, reason: "unhealthy_revision", revision: REVISION_LABEL },
    };
  }
  return null;
}

export function registerHealthRoutes(app: Hono): void {
  app.get("/health", (c) => {
    const failure = failureReason();
    if (failure) return c.json(failure.body, failure.status);
    return c.json({ ok: true, revision: REVISION_LABEL, service: "patient" });
  });

  app.get("/", (c) => {
    if (missingConfig()) return c.json({ error: "misconfigured", key: REQUIRED_CONFIG_KEY }, 500);
    if (IS_BAD_REVISION) return c.json({ error: "bad_revision", revision: REVISION_LABEL }, 500);
    return c.json({ message: "patient ok", revision: REVISION_LABEL });
  });
}
