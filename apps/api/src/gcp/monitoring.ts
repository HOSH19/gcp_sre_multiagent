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

export type UptimeCheckState = {
  checkId: string;
  displayName?: string;
  host?: string;
  path?: string;
  passing: boolean;
  latencyMs?: number;
  checkedAt?: string;
  raw: {
    config?: UptimeCheckConfig;
    checkPassedSeries?: unknown;
    latencySeries?: unknown;
  };
};

type TimeSeriesPoint = {
  interval?: { endTime?: string; startTime?: string };
  value?: {
    boolValue?: boolean;
    doubleValue?: number;
    int64Value?: string | number;
    distributionValue?: { mean?: number; count?: string | number };
  };
};

type TimeSeries = {
  metric?: { type?: string; labels?: Record<string, string> };
  resource?: { type?: string; labels?: Record<string, string> };
  points?: TimeSeriesPoint[];
};

async function accessToken(): Promise<string> {
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error("failed to obtain GCP access token for Cloud Monitoring");
  return token.token;
}

function projectParent(): string {
  return `projects/${config.projectId}`;
}

function shortCheckId(nameOrId: string): string {
  const parts = nameOrId.split("/");
  return parts[parts.length - 1] ?? nameOrId;
}

function fullCheckName(checkId: string): string {
  if (checkId.includes("/")) return checkId;
  return `${projectParent()}/uptimeCheckConfigs/${checkId}`;
}

/** Hostname (+ optional port) used to match uptime_url monitored resources. */
export function hostFromServiceUrl(url: string): string | undefined {
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

async function monGet(path: string, query?: Record<string, string>): Promise<Response> {
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

export async function listUptimeCheckConfigs(): Promise<UptimeCheckConfig[]> {
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
  // Health URL often ends with /health; uptime check path is typically /health
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
      // Prefer path match but still allow host-only if unique later
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

  throw new Error(
    `no uptime check found for host=${host}; set UPTIME_CHECK_ID or create a monitoring uptime check`,
  );
}

async function listTimeSeries(
  filter: string,
  aligner: "ALIGN_NEXT_OLDER" | "ALIGN_MEAN" | "ALIGN_FRACTION_TRUE",
  lookbackMs = 15 * 60 * 1000,
): Promise<TimeSeries[]> {
  const end = new Date();
  const start = new Date(end.getTime() - lookbackMs);
  const res = await monGet(`${projectParent()}/timeSeries`, {
    filter,
    "interval.endTime": end.toISOString(),
    "interval.startTime": start.toISOString(),
    "aggregation.alignmentPeriod": "60s",
    "aggregation.perSeriesAligner": aligner,
    view: "FULL",
  });
  if (!res.ok) throw new Error(`listTimeSeries failed (${res.status}): ${await res.text()}`);
  const body = (await res.json()) as { timeSeries?: TimeSeries[] };
  return body.timeSeries ?? [];
}

function latestPoint(series: TimeSeries[]): TimeSeriesPoint | undefined {
  let best: TimeSeriesPoint | undefined;
  let bestTs = 0;
  for (const ts of series) {
    for (const p of ts.points ?? []) {
      const t = Date.parse(p.interval?.endTime ?? p.interval?.startTime ?? "");
      if (!Number.isFinite(t)) {
        if (!best) best = p;
        continue;
      }
      if (t >= bestTs) {
        bestTs = t;
        best = p;
      }
    }
  }
  return best;
}

function pointPassing(point: TimeSeriesPoint | undefined): boolean | undefined {
  if (!point?.value) return undefined;
  const v = point.value;
  if (typeof v.boolValue === "boolean") return v.boolValue;
  if (typeof v.doubleValue === "number") return v.doubleValue >= 1;
  if (v.int64Value != null) return Number(v.int64Value) >= 1;
  return undefined;
}

function pointLatencyMs(point: TimeSeriesPoint | undefined): number | undefined {
  if (!point?.value) return undefined;
  const v = point.value;
  if (v.distributionValue?.mean != null) return Math.round(v.distributionValue.mean);
  if (typeof v.doubleValue === "number") return Math.round(v.doubleValue);
  if (v.int64Value != null) return Math.round(Number(v.int64Value));
  return undefined;
}

/**
 * Latest uptime check result for the target service (config + check_passed + request_latency).
 */
export async function getLatestUptimeCheckState(opts?: {
  checkId?: string;
  serviceUrl?: string;
}): Promise<UptimeCheckState> {
  const cfg = opts?.checkId
    ? await getUptimeCheckConfig(opts.checkId)
    : await resolveUptimeCheckConfig(opts?.serviceUrl);

  const checkId = shortCheckId(cfg.name ?? opts?.checkId ?? config.uptimeCheckId);
  if (!checkId) throw new Error("uptime check config missing name");

  const checkFilter =
    `metric.type="monitoring.googleapis.com/uptime_check/check_passed" AND ` +
    `metric.labels.check_id="${checkId}"`;
  const latencyFilter =
    `metric.type="monitoring.googleapis.com/uptime_check/request_latency" AND ` +
    `metric.labels.check_id="${checkId}"`;

  const [passedSeries, latencySeries] = await Promise.all([
    listTimeSeries(checkFilter, "ALIGN_NEXT_OLDER"),
    listTimeSeries(latencyFilter, "ALIGN_MEAN"),
  ]);

  const passedPoint = latestPoint(passedSeries);
  const latencyPoint = latestPoint(latencySeries);
  const passing = pointPassing(passedPoint);
  if (passing === undefined && !passedSeries.length) {
    throw new Error(
      `no check_passed time series for check_id=${checkId} in the last 15m (check may be new or disabled)`,
    );
  }

  return {
    checkId,
    displayName: cfg.displayName,
    host: cfg.monitoredResource?.labels?.host,
    path: cfg.httpCheck?.path,
    passing: passing ?? false,
    latencyMs: pointLatencyMs(latencyPoint),
    checkedAt: passedPoint?.interval?.endTime ?? latencyPoint?.interval?.endTime,
    raw: {
      config: cfg,
      checkPassedSeries: passedSeries,
      latencySeries,
    },
  };
}
