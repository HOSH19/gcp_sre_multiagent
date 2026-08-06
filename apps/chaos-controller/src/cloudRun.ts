import { GoogleAuth } from "google-auth-library";

type CloudRunConfig = {
  projectId: string;
  region: string;
  serviceName: string;
};

type EnvVar = { name?: string | null; value?: string | null };
type Container = { name?: string | null; image?: string | null; env?: EnvVar[] | null; [key: string]: unknown };
type TrafficTarget = {
  type?: string;
  revision?: string;
  percent?: number;
  tag?: string;
};
type Service = {
  name?: string;
  etag?: string;
  template?: { containers?: Container[]; [key: string]: unknown };
  traffic?: TrafficTarget[];
  latestReadyRevision?: string;
  [key: string]: unknown;
};
type Operation = {
  name?: string;
  done?: boolean;
  error?: { code?: number; message?: string };
  response?: Service;
};

const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });

function serviceResource(cfg: CloudRunConfig): string {
  return `projects/${cfg.projectId}/locations/${cfg.region}/services/${cfg.serviceName}`;
}

function shortRevision(name: string): string {
  const parts = name.split("/");
  return parts[parts.length - 1] ?? name;
}

async function accessToken(): Promise<string> {
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error("failed to obtain GCP access token for Cloud Run Admin");
  return token.token;
}

async function runFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await accessToken();
  const url = path.startsWith("https://") ? path : `https://run.googleapis.com/v2/${path}`;
  return fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
}

async function awaitOperation(op: Operation, timeoutMs = 120_000): Promise<Service> {
  if (op.done) {
    if (op.error) throw new Error(`Cloud Run operation failed: ${op.error.message ?? JSON.stringify(op.error)}`);
    return op.response ?? {};
  }
  if (!op.name) throw new Error("Cloud Run operation missing name");
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const opRes = await runFetch(`https://run.googleapis.com/v2/${op.name}`);
    if (!opRes.ok) {
      throw new Error(`Cloud Run operation poll failed (${opRes.status}): ${await opRes.text()}`);
    }
    const current = (await opRes.json()) as Operation;
    if (current.done) {
      if (current.error) {
        throw new Error(`Cloud Run operation failed: ${current.error.message ?? JSON.stringify(current.error)}`);
      }
      return current.response ?? {};
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Cloud Run operation timed out: ${op.name}`);
}

export async function getService(cfg: CloudRunConfig): Promise<Service> {
  const res = await runFetch(serviceResource(cfg));
  if (!res.ok) throw new Error(`getService failed (${res.status}): ${await res.text()}`);
  return (await res.json()) as Service;
}

export function trafficMap(service: Service): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of service.traffic ?? []) {
    const rev = t.revision
      ? shortRevision(t.revision)
      : t.type === "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
        ? "LATEST"
        : "unknown";
    out[rev] = (out[rev] ?? 0) + (t.percent ?? 0);
  }
  return out;
}

function serviceEnv(service: Service): Record<string, string> {
  const env = service.template?.containers?.[0]?.env ?? [];
  const out: Record<string, string> = {};
  for (const e of env) {
    if (e.name && e.value != null) out[e.name] = e.value;
  }
  return out;
}

export async function updateTraffic(
  cfg: CloudRunConfig,
  allocations: Array<{ revision: string; percent: number }>,
): Promise<{ traffic: Record<string, number>; service: Service }> {
  const total = allocations.reduce((s, a) => s + a.percent, 0);
  if (total !== 100) throw new Error(`traffic percents must sum to 100 (got ${total})`);

  const body = {
    traffic: allocations.map((a) => ({
      type: "TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION",
      revision: shortRevision(a.revision),
      percent: a.percent,
    })),
  };
  const res = await runFetch(`${serviceResource(cfg)}?updateMask=traffic`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`updateTraffic failed (${res.status}): ${await res.text()}`);
  const op = (await res.json()) as Operation;
  const service = await awaitOperation(op);
  return { traffic: trafficMap(service), service };
}

/** Patch env vars on the service template (creates a new revision). `null` removes a key. */
export async function patchServiceEnv(
  cfg: CloudRunConfig,
  patch: Record<string, string | null>,
): Promise<{ env: Record<string, string>; latestRevision?: string; service: Service }> {
  const current = await getService(cfg);
  const container = current.template?.containers?.[0];
  if (!container) throw new Error("patient service has no container template");

  const envMap = new Map<string, string>();
  for (const e of container.env ?? []) {
    if (e.name && e.value != null) envMap.set(e.name, e.value);
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) envMap.delete(key);
    else envMap.set(key, value);
  }

  const nextEnv: EnvVar[] = [...envMap.entries()].map(([name, value]) => ({ name, value }));
  const body = {
    template: {
      ...current.template,
      containers: [{ ...container, env: nextEnv }],
    },
    traffic: [{ type: "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST", percent: 100 }],
  };

  const res = await runFetch(`${serviceResource(cfg)}?updateMask=template,traffic`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`patchServiceEnv failed (${res.status}): ${await res.text()}`);
  const op = (await res.json()) as Operation;
  const service = await awaitOperation(op);
  const latest = service.latestReadyRevision;
  return {
    env: serviceEnv(service),
    latestRevision: latest ? shortRevision(latest) : undefined,
    service,
  };
}
