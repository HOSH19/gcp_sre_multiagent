import { Hono } from "hono";
import { SCENARIOS } from "@gcp-sre/shared";
import { config } from "../config.js";
import { loadServiceRegistry } from "../fleet/index.js";
import { countActiveLeases, getActiveRunId, getActiveSoakId, listActiveRunIds } from "../store/index.js";

export function registerMetaRoutes(app: Hono): void {
  app.get("/health", async (c) => {
    // Durable-store calls can fail if Firestore isn't provisioned yet — keep /health alive.
    let activeRunId: string | null = null;
    let activeRunIds: string[] = [];
    let activeLeaseCount = 0;
    let activeSoakId: string | null = null;
    let storeError: string | undefined;
    try {
      activeRunId = await getActiveRunId();
      activeRunIds = await listActiveRunIds();
      activeLeaseCount = await countActiveLeases();
      activeSoakId = await getActiveSoakId();
    } catch (err) {
      storeError = err instanceof Error ? err.message : String(err);
      console.error("[health] store probe failed:", storeError);
    }
    return c.json({
      ok: !storeError,
      service: "api",
      mode: config.mode,
      storeBackend: config.storeBackend,
      reactEnabled: config.reactEnabled,
      pagingEnabled: config.pagingEnabled,
      maxConcurrentRuns: config.maxConcurrentRuns,
      maxConcurrentPerService: config.maxConcurrentPerService,
      activeRunId,
      activeRunIds,
      activeLeaseCount,
      activeSoakId,
      ...(storeError ? { storeError } : {}),
    });
  });
  app.get("/scenarios", (c) => c.json({ scenarios: Object.values(SCENARIOS) }));
  app.get("/fleet/registry", async (c) => c.json({ registry: await loadServiceRegistry() }));
}
