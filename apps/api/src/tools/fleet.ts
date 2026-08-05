import { loadServiceRegistry, serviceKey } from "../fleet/registry.js";
import { listCloudRunServicesRaw } from "../gcp/cloudRun.js";
import { config } from "../config.js";
import { evidence } from "./evidence.js";
import type { ToolCallContext } from "./types.js";

/**
 * Fleet discovery: list Cloud Run services in registry scope.
 * In MODE=gcp, intersects live Cloud Run list with the registry; locally returns registry only.
 */
export async function listCloudRunServices(_ctx?: ToolCallContext) {
  const registry = await loadServiceRegistry();
  const registryKeys = new Set(registry.services.map(serviceKey));

  if (config.mode === "gcp") {
    try {
      const regions = new Map<string, { projectId: string; region: string }>();
      for (const s of registry.services) {
        regions.set(`${s.projectId}/${s.region}`, { projectId: s.projectId, region: s.region });
      }

      const live: Array<{
        name: string;
        projectId: string;
        region: string;
        uri?: string;
        latestReadyRevision?: string;
        inRegistry: true;
        owner?: string;
        chaosLab?: boolean;
        uptimeCheckId?: string;
      }> = [];

      for (const { projectId, region } of regions.values()) {
        const listed = await listCloudRunServicesRaw({ projectId, region });
        for (const svc of listed) {
          const key = `${projectId}/${region}/${svc.name}`;
          if (!registryKeys.has(key)) continue;
          const entry = registry.services.find(
            (e) => e.projectId === projectId && e.region === region && e.name === svc.name,
          );
          live.push({
            name: svc.name,
            projectId,
            region,
            uri: svc.uri,
            latestReadyRevision: svc.latestReadyRevision,
            inRegistry: true,
            owner: entry?.owner,
            chaosLab: entry?.chaosLab,
            uptimeCheckId: entry?.uptimeCheckId,
          });
        }
      }

      return evidence(
        "listCloudRunServices",
        `Registry fleet (${live.length}/${registry.services.length} live): ${live
          .map((s) => s.name)
          .join(", ") || "(none)"}`,
        { services: live, registryCount: registry.services.length, source: "cloud_run+registry" },
      );
    } catch (err) {
      const services = registry.services.map((s) => ({
        ...s,
        inRegistry: true as const,
        source: "registry_fallback",
      }));
      return evidence(
        "listCloudRunServices",
        `Cloud Run list failed; registry only (${String(err)})`,
        { services, source: "fallback", error: String(err) },
      );
    }
  }

  const services = registry.services.map((s) => ({ ...s, inRegistry: true as const }));
  return evidence(
    "listCloudRunServices",
    `Registry fleet (${services.length}): ${services.map((s) => s.name).join(", ")}`,
    { services, source: "registry" },
  );
}
