import { config } from "../config.js";
import {
  getUptimeCheckConfig,
  monGet,
  projectParent,
  resolveUptimeCheckConfig,
  shortCheckId,
  type UptimeCheckConfig,
} from "./uptimeConfig.js";

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

/** Latest uptime check result for the target service (config + check_passed + request_latency). */
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
