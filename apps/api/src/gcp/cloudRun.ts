import { GoogleAuth } from "google-auth-library";
import { config } from "../config.js";

type EnvVar = { name?: string | null; value?: string | null };
type Container = { env?: EnvVar[] | null; [key: string]: unknown };
type TrafficTarget = { type?: string; revision?: string; percent?: number };
type Service = {
  template?: { containers?: Container[] };
  traffic?: TrafficTarget[];
  latestReadyRevision?: string;
};
type Revision = {
  name?: string;
  containers?: Container[];
  createTime?: string;
};

const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });

function serviceResource(): string {
  return `projects/${config.projectId}/locations/${config.region}/services/${config.patientServiceName}`;
}

function shortRevision(name: string): string {
  const parts = name.split("/");
  return parts[parts.length - 1] ?? name;
}

async function accessToken(): Promise<string> {
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error("failed to obtain GCP access token");
  return token.token;
}

async function runFetch(path: string): Promise<Response> {
  const token = await accessToken();
  const url = path.startsWith("https://") ? path : `https://run.googleapis.com/v2/${path}`;
  return fetch(url, {
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  });
}

function envFrom(container?: Container | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of container?.env ?? []) {
    if (e.name && e.value != null) out[e.name] = e.value;
  }
  return out;
}

export async function fetchCloudRunService(): Promise<{
  traffic: Record<string, number>;
  env: Record<string, string>;
  latestReadyRevision?: string;
}> {
  const res = await runFetch(serviceResource());
  if (!res.ok) throw new Error(`Cloud Run getService failed (${res.status}): ${await res.text()}`);
  const service = (await res.json()) as Service;
  const traffic: Record<string, number> = {};
  for (const t of service.traffic ?? []) {
    const rev = t.revision
      ? shortRevision(t.revision)
      : t.type === "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
        ? "LATEST"
        : "unknown";
    traffic[rev] = (traffic[rev] ?? 0) + (t.percent ?? 0);
  }
  return {
    traffic,
    env: envFrom(service.template?.containers?.[0]),
    latestReadyRevision: service.latestReadyRevision
      ? shortRevision(service.latestReadyRevision)
      : undefined,
  };
}

export async function fetchCloudRunRevisions(): Promise<
  Array<{ name: string; healthy: boolean; env: Record<string, string> }>
> {
  const res = await runFetch(`${serviceResource()}/revisions?pageSize=20`);
  if (!res.ok) throw new Error(`Cloud Run listRevisions failed (${res.status}): ${await res.text()}`);
  const body = (await res.json()) as { revisions?: Revision[] };
  return (body.revisions ?? []).map((r) => {
    const name = shortRevision(r.name ?? "");
    const env = envFrom(r.containers?.[0]);
    const healthy = env.IS_BAD_REVISION?.toLowerCase() !== "true" && Boolean(env.APP_SECRET);
    return { name, healthy, env };
  });
}
