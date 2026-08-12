import { GoogleAuth } from "google-auth-library";
import { config } from "../config.js";

type EnvVar = { name?: string | null; value?: string | null };
type Container = { env?: EnvVar[] | null; [key: string]: unknown };
type TrafficTarget = { type?: string; revision?: string; percent?: number };
type Service = {
  name?: string;
  uri?: string;
  template?: { containers?: Container[] };
  traffic?: TrafficTarget[];
  latestReadyRevision?: string;
};
type Revision = {
  name?: string;
  containers?: Container[];
  createTime?: string;
};

export type CloudRunServiceRef = {
  projectId?: string;
  region?: string;
  name?: string;
};

const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });

function resolveRef(ref?: CloudRunServiceRef): Required<CloudRunServiceRef> {
  return {
    projectId: ref?.projectId ?? config.projectId,
    region: ref?.region ?? config.region,
    name: ref?.name ?? config.patientServiceName,
  };
}

function serviceResource(ref?: CloudRunServiceRef): string {
  const r = resolveRef(ref);
  return `projects/${r.projectId}/locations/${r.region}/services/${r.name}`;
}

function servicesParent(projectId: string, region: string): string {
  return `projects/${projectId}/locations/${region}/services`;
}

function shortRevision(name: string): string {
  const parts = name.split("/");
  return parts[parts.length - 1] ?? name;
}

function shortServiceName(name: string): string {
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

export async function listCloudRunServicesRaw(opts?: {
  projectId?: string;
  region?: string;
}): Promise<Array<{ name: string; uri?: string; latestReadyRevision?: string }>> {
  const projectId = opts?.projectId ?? config.projectId;
  const region = opts?.region ?? config.region;
  const services: Array<{ name: string; uri?: string; latestReadyRevision?: string }> = [];
  let pageToken: string | undefined;

  do {
    const path =
      `${servicesParent(projectId, region)}` +
      (pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : "");
    const res = await runFetch(path);
    if (!res.ok) {
      throw new Error(`Cloud Run listServices failed (${res.status}): ${await res.text()}`);
    }
    const body = (await res.json()) as { services?: Service[]; nextPageToken?: string };
    for (const s of body.services ?? []) {
      services.push({
        name: shortServiceName(s.name ?? ""),
        uri: s.uri,
        latestReadyRevision: s.latestReadyRevision
          ? shortRevision(s.latestReadyRevision)
          : undefined,
      });
    }
    pageToken = body.nextPageToken;
  } while (pageToken);

  return services.filter((s) => s.name);
}

export async function fetchCloudRunService(ref?: CloudRunServiceRef): Promise<{
  traffic: Record<string, number>;
  env: Record<string, string>;
  latestReadyRevision?: string;
}> {
  const res = await runFetch(serviceResource(ref));
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

export type CloudRunRevision = {
  name: string;
  healthy: boolean;
  env: Record<string, string>;
  createTime?: string;
};

export function limitRevisionsForEvidence(
  revisions: CloudRunRevision[],
  traffic: Record<string, number>,
  max = 6,
): CloudRunRevision[] {
  if (revisions.length <= max) return revisions;

  const byTime = [...revisions].sort((a, b) => (b.createTime ?? "").localeCompare(a.createTime ?? ""));
  const selected = new Map<string, CloudRunRevision>();
  const add = (revision: CloudRunRevision) => {
    if (revision.name) selected.set(revision.name, revision);
  };

  for (const revision of byTime) {
    if ((traffic[revision.name] ?? 0) > 0) add(revision);
  }

  const latestUnhealthy = byTime.find((revision) => !revision.healthy);
  if (latestUnhealthy) add(latestUnhealthy);

  for (const revision of byTime) {
    if (selected.size >= max) break;
    add(revision);
  }

  return [...selected.values()].sort((a, b) => (b.createTime ?? "").localeCompare(a.createTime ?? ""));
}

export async function fetchCloudRunRevisions(ref?: CloudRunServiceRef): Promise<CloudRunRevision[]> {
  const res = await runFetch(`${serviceResource(ref)}/revisions?pageSize=20`);
  if (!res.ok) throw new Error(`Cloud Run listRevisions failed (${res.status}): ${await res.text()}`);
  const body = (await res.json()) as { revisions?: Revision[] };
  return (body.revisions ?? []).map((r) => {
    const name = shortRevision(r.name ?? "");
    const env = envFrom(r.containers?.[0]);
    const healthy = env.IS_BAD_REVISION?.toLowerCase() !== "true" && Boolean(env.APP_SECRET);
    return { name, healthy, env, createTime: r.createTime };
  });
}
