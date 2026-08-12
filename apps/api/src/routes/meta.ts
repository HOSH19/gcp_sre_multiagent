import { Hono } from "hono";
import { SCENARIOS } from "@gcp-sre/shared";
import { config } from "../config.js";
import { findActiveRunForTarget } from "../fleet/correlate.js";
import { loadServiceRegistry } from "../fleet/index.js";
import { countActiveLeases, getActiveRunId, listActiveRunIds } from "../store/index.js";

export function registerMetaRoutes(app: Hono): void {
  app.get("/health", async (c) => {
    let activeRunId: string | null = null;
    let activeRunIds: string[] = [];
    let activeLeaseCount = 0;
    let blockingRun: { id: string; status: string; targetService: string } | null = null;
    let storeError: string | undefined;
    try {
      activeRunId = await getActiveRunId();
      activeRunIds = await listActiveRunIds();
      activeLeaseCount = await countActiveLeases();
      const blocker = await findActiveRunForTarget({
        targetService: config.patientServiceName,
        projectId: config.projectId,
        region: config.region,
      });
      if (blocker) {
        blockingRun = {
          id: blocker.id,
          status: blocker.status,
          targetService: blocker.targetService ?? blocker.patientService,
        };
      }
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
      blockingRun,
      ...(storeError ? { storeError } : {}),
    });
  });
  app.get("/scenarios", (c) => c.json({ scenarios: Object.values(SCENARIOS) }));
  app.get("/fleet/registry", async (c) => c.json({ registry: await loadServiceRegistry() }));
}
