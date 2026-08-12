import { GoogleAuth } from "google-auth-library";
import { config } from "../config.js";

const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });

export type UptimeCheckConfig = {
  name?: string;
  displayName?: string;
  monitoredResource?: { type?: string; labels?: Record<string, string> };
  httpCheck?: { path?: string; port?: number; useSsl?: boolean };
  period?: string;
  timeout?: string;
};

export async function accessToken(): Promise<string> {
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error("failed to obtain GCP access token for Cloud Monitoring");
  return token.token;
}

export function projectParent(): string {
  return `projects/${config.projectId}`;
}

export function shortCheckId(nameOrId: string): string {
  const parts = nameOrId.split("/");
  return parts[parts.length - 1] ?? nameOrId;
}

export class UptimeCheckNotFoundError extends Error {
  readonly host?: string;

  constructor(message: string, host?: string) {
    super(message);
    this.name = "UptimeCheckNotFoundError";
    this.host = host;
  }
}

function fullCheckName(checkId: string): string {
  if (checkId.includes("/")) return checkId;
  return `${projectParent()}/uptimeCheckConfigs/${checkId}`;
}

function hostFromServiceUrl(url: string): string | undefined {
  try {
    const u = new URL(url.includes("://") ? url : `https://${url}`);
    return u.host || undefined;
  } catch {
    return undefined;
  }
}

function targetServiceUrl(): string {
  return (
    config.patientServiceUrl ||
    config.patientHealthUrl.replace(/\/health\/?$/, "") ||
    config.patientHealthUrl
  );
}

export async function monGet(path: string, query?: Record<string, string>): Promise<Response> {
  const token = await accessToken();
  const url = new URL(
    path.startsWith("https://") ? path : `https://monitoring.googleapis.com/v3/${path}`,
  );
  if (query) {
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  }
  return fetch(url, {
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  });
}

async function listUptimeCheckConfigs(): Promise<UptimeCheckConfig[]> {
  const configs: UptimeCheckConfig[] = [];
  let pageToken: string | undefined;
  do {
    const query: Record<string, string> = { pageSize: "100" };
    if (pageToken) query.pageToken = pageToken;
    const res = await monGet(`${projectParent()}/uptimeCheckConfigs`, query);
    if (!res.ok) throw new Error(`listUptimeCheckConfigs failed (${res.status}): ${await res.text()}`);
    const body = (await res.json()) as {
      uptimeCheckConfigs?: UptimeCheckConfig[];
      nextPageToken?: string;
    };
    configs.push(...(body.uptimeCheckConfigs ?? []));
    pageToken = body.nextPageToken;
  } while (pageToken);
  return configs;
}

export async function getUptimeCheckConfig(checkId: string): Promise<UptimeCheckConfig> {
  const res = await monGet(fullCheckName(checkId));
  if (!res.ok) throw new Error(`getUptimeCheckConfig failed (${res.status}): ${await res.text()}`);
  return (await res.json()) as UptimeCheckConfig;
}

/**
 * Resolve the uptime check for the target service:
 * 1. UPTIME_CHECK_ID if set
 * 2. Else discover by monitoredResource host / http path matching the service URL
 */
export async function resolveUptimeCheckConfig(serviceUrl?: string): Promise<UptimeCheckConfig> {
  if (config.uptimeCheckId) {
    return getUptimeCheckConfig(config.uptimeCheckId);
  }

  const url = serviceUrl ?? targetServiceUrl();
  const host = hostFromServiceUrl(url);
  if (!host) {
    throw new Error(`cannot discover uptime check: no host in service URL (${url})`);
  }

  let pathHint: string | undefined;
  try {
    pathHint = new URL(url.includes("://") ? url : `https://${url}`).pathname || undefined;
  } catch {
    pathHint = undefined;
  }
  if (!pathHint || pathHint === "/") pathHint = "/health";

  const configs = await listUptimeCheckConfigs();
  const hostLower = host.toLowerCase();
  const matches = configs.filter((c) => {
    const labels = c.monitoredResource?.labels ?? {};
    const cfgHost = (labels.host ?? labels.hostname ?? "").toLowerCase();
    if (!cfgHost) return false;
    if (cfgHost !== hostLower && !hostLower.endsWith(cfgHost) && !cfgHost.endsWith(hostLower)) {
      return false;
    }
    const cfgPath = c.httpCheck?.path ?? "/";
    if (pathHint && pathHint !== "/" && cfgPath !== "/" && cfgPath !== pathHint) {
      return cfgPath === pathHint || pathHint.endsWith(cfgPath) || cfgPath.endsWith(pathHint);
    }
    return true;
  });

  if (matches.length === 1) return matches[0]!;
  if (matches.length > 1) {
    const pathExact = matches.find((c) => (c.httpCheck?.path ?? "/") === pathHint);
    if (pathExact) return pathExact;
    const byName = matches.find((c) =>
      (c.displayName ?? "").toLowerCase().includes(config.patientServiceName.toLowerCase()),
    );
    if (byName) return byName;
    throw new Error(
      `multiple uptime checks match host=${host}; set UPTIME_CHECK_ID (candidates: ${matches
        .map((c) => shortCheckId(c.name ?? c.displayName ?? "?"))
        .join(", ")})`,
    );
  }

  const patientName = config.patientServiceName.toLowerCase();
  const byDisplayName = configs.find((c) => (c.displayName ?? "").toLowerCase() === "patient-health");
  if (byDisplayName) return byDisplayName;

  const byPatientLabel = configs.filter((c) =>
    (c.displayName ?? "").toLowerCase().includes(patientName),
  );
  if (byPatientLabel.length === 1) return byPatientLabel[0]!;

  const healthChecks = configs.filter((c) => (c.httpCheck?.path ?? "/") === "/health");
  if (healthChecks.length === 1) return healthChecks[0]!;

  throw new UptimeCheckNotFoundError(
    `no uptime check found for host=${host}; run scripts/setup-monitoring.sh or set UPTIME_CHECK_ID`,
    host,
  );
}
