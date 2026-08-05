import {
  nowIso,
  type MappedAlert,
  type ServiceRegistry,
  type ServiceRegistryEntry,
} from "@gcp-sre/shared";
import { config } from "../config.js";
import { firestoreGetServiceRegistry } from "../store/firestore.js";

let cached: { at: number; registry: ServiceRegistry } | null = null;
const CACHE_TTL_MS = 30_000;

function patientEntry(): ServiceRegistryEntry {
  return {
    projectId: config.projectId,
    region: config.region,
    name: config.patientServiceName,
    owner: "chaos-lab",
    chaosLab: true,
    uptimeCheckId: config.uptimeCheckId || undefined,
    playbookHints: [
      "Demo chaos-lab patient — inject scenarios via chaos controller only",
      "Check /health, revisions, traffic split, and required env APP_SECRET",
    ],
    pagerPolicy: {
      severity: "warning",
      slackChannel: undefined,
      pagerDutyServiceKey: undefined,
    },
  };
}

function normalizeEntry(raw: Partial<ServiceRegistryEntry> & { name: string }): ServiceRegistryEntry {
  return {
    projectId: raw.projectId ?? config.projectId,
    region: raw.region ?? config.region,
    name: raw.name,
    owner: raw.owner,
    uptimeCheckId: raw.uptimeCheckId,
    chaosLab: raw.chaosLab,
    pagerPolicy: raw.pagerPolicy,
    playbookHints: raw.playbookHints,
  };
}

function parseRegistryJson(raw: string): ServiceRegistry | null {
  try {
    const parsed = JSON.parse(raw) as ServiceRegistry | ServiceRegistryEntry[];
    if (Array.isArray(parsed)) {
      return { version: 1, services: parsed.map((e) => normalizeEntry(e)) };
    }
    if (parsed && Array.isArray(parsed.services)) {
      return {
        version: parsed.version ?? 1,
        updatedAt: parsed.updatedAt,
        services: parsed.services.map((e) => normalizeEntry(e)),
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function ensurePatient(registry: ServiceRegistry): ServiceRegistry {
  const hasPatient = registry.services.some(
    (s) =>
      s.name === config.patientServiceName &&
      s.projectId === config.projectId &&
      s.region === config.region,
  );
  if (hasPatient) {
    return {
      ...registry,
      services: registry.services.map((s) =>
        s.name === config.patientServiceName && s.chaosLab === undefined
          ? { ...s, chaosLab: true }
          : s,
      ),
    };
  }
  return { ...registry, services: [patientEntry(), ...registry.services] };
}

function fromEnv(): ServiceRegistry | null {
  if (!config.serviceRegistryJson) return null;
  return parseRegistryJson(config.serviceRegistryJson);
}

/** Default local/demo registry: chaos-lab patient only. */
export function defaultServiceRegistry(): ServiceRegistry {
  return {
    version: 1,
    updatedAt: nowIso(),
    services: [patientEntry()],
  };
}

/**
 * Load the in-scope Cloud Run service registry.
 * Precedence: SERVICE_REGISTRY_JSON → Firestore config/serviceRegistry → patient default.
 */
export async function loadServiceRegistry(opts?: { force?: boolean }): Promise<ServiceRegistry> {
  if (!opts?.force && cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.registry;
  }

  const envReg = fromEnv();
  if (envReg) {
    const registry = ensurePatient(envReg);
    cached = { at: Date.now(), registry };
    return registry;
  }

  if (config.useDurableStore) {
    try {
      const fromFs = await firestoreGetServiceRegistry();
      if (fromFs?.services?.length) {
        const registry = ensurePatient({
          version: fromFs.version ?? 1,
          updatedAt: fromFs.updatedAt,
          services: fromFs.services.map((e) => normalizeEntry(e)),
        });
        cached = { at: Date.now(), registry };
        return registry;
      }
    } catch (err) {
      console.warn("[registry] Firestore load failed; using default:", err);
    }
  }

  const registry = defaultServiceRegistry();
  cached = { at: Date.now(), registry };
  return registry;
}

export function serviceKey(entry: Pick<ServiceRegistryEntry, "projectId" | "region" | "name">): string {
  return `${entry.projectId}/${entry.region}/${entry.name}`;
}

export async function findRegistryService(opts: {
  name?: string;
  projectId?: string;
  region?: string;
}): Promise<ServiceRegistryEntry | undefined> {
  const registry = await loadServiceRegistry();
  const name = opts.name;
  if (!name) return undefined;
  const projectId = opts.projectId ?? config.projectId;
  const region = opts.region ?? config.region;

  const exact = registry.services.find(
    (s) => s.name === name && s.projectId === projectId && s.region === region,
  );
  if (exact) return exact;

  return registry.services.find((s) => s.name === name && s.projectId === projectId);
}

/** Resolve a registry entry for an investigation run (falls back to patient). */
export async function registryEntryForRun(run: {
  targetService?: string;
  patientService?: string;
  projectId?: string;
  region?: string;
}): Promise<ServiceRegistryEntry> {
  const name = run.targetService ?? run.patientService ?? config.patientServiceName;
  const found = await findRegistryService({
    name,
    projectId: run.projectId,
    region: run.region,
  });
  if (found) return found;
  return {
    projectId: run.projectId ?? config.projectId,
    region: run.region ?? config.region,
    name,
  };
}

export type { MappedAlert, ServiceRegistry, ServiceRegistryEntry };
