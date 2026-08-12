import { GoogleAuth } from "google-auth-library";
import { config } from "../config.js";

const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });

type LogEntry = {
  timestamp?: string;
  severity?: string;
  textPayload?: string;
  jsonPayload?: Record<string, unknown>;
  resource?: { labels?: Record<string, string> };
};

async function accessToken(): Promise<string> {
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error("failed to obtain GCP access token for Cloud Logging");
  return token.token;
}

function hasMessageBody(entry: LogEntry): boolean {
  if (entry.textPayload?.trim()) return true;
  if (entry.jsonPayload) {
    const msg = entry.jsonPayload.message ?? entry.jsonPayload.msg ?? entry.jsonPayload.error;
    if (typeof msg === "string" && msg.trim()) return true;
    if (JSON.stringify(entry.jsonPayload) !== "{}") return true;
  }
  return false;
}

function entryText(entry: LogEntry): string {
  if (entry.textPayload?.trim()) return entry.textPayload.trim();
  if (entry.jsonPayload) {
    const msg = entry.jsonPayload.message ?? entry.jsonPayload.msg ?? entry.jsonPayload.error;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
    const compact = JSON.stringify(entry.jsonPayload);
    if (compact !== "{}") return compact.slice(0, 200);
  }
  return "";
}

/** Collapses body-less ERROR rows into one bucket; groups distinct messages by text. */
export function groupErrorEntries(
  entries: Array<{ timestamp?: string; message: string; bodyLess: boolean }>,
  serviceName: string,
): Array<{ message: string; count: number }> {
  const messageCounts = new Map<string, number>();
  let bodyLessCount = 0;
  let bodyLessOldest: string | undefined;
  let bodyLessNewest: string | undefined;

  for (const entry of entries) {
    if (entry.bodyLess) {
      bodyLessCount += 1;
      if (entry.timestamp) {
        if (!bodyLessOldest || entry.timestamp < bodyLessOldest) bodyLessOldest = entry.timestamp;
        if (!bodyLessNewest || entry.timestamp > bodyLessNewest) bodyLessNewest = entry.timestamp;
      }
      continue;
    }
    const key = entry.message.slice(0, 200);
    messageCounts.set(key, (messageCounts.get(key) ?? 0) + 1);
  }

  const errors: Array<{ message: string; count: number }> = [...messageCounts.entries()].map(
    ([message, count]) => ({ message, count }),
  );

  if (bodyLessCount > 0) {
    const range =
      bodyLessOldest && bodyLessNewest
        ? bodyLessOldest === bodyLessNewest
          ? ` (${bodyLessOldest})`
          : ` (${bodyLessOldest} .. ${bodyLessNewest})`
        : bodyLessOldest || bodyLessNewest
          ? ` (${bodyLessOldest ?? bodyLessNewest})`
          : "";
    errors.unshift({
      message: `${bodyLessCount} ERROR log entries (no message body) on ${serviceName} — likely health-check/503 failures${range}`,
      count: bodyLessCount,
    });
  }

  if (!errors.length) return [{ message: "No recent error-severity log entries", count: 0 }];
  return errors;
}

/** Human-readable summary for grouped error log entries (avoids confusing "(empty) (n=40)"). */
export function formatErrorGroupsSummary(errors: Array<{ message: string; count: number }>): string {
  if (errors.length === 1 && errors[0]?.count === 0) {
    return "No error-severity log entries in lookback window";
  }
  const parts = errors.map((e) => `${e.message} (${e.count} ${e.count === 1 ? "entry" : "entries"})`);
  return `Error groups (${errors.length}): ${parts.join("; ")}`;
}

export async function queryServiceLogs(opts?: {
  filterExtra?: string;
  pageSize?: number;
  serviceName?: string;
  projectId?: string;
  region?: string;
}): Promise<Array<{ timestamp?: string; severity?: string; message: string; bodyLess: boolean; revision?: string }>> {
  const token = await accessToken();
  const serviceName = opts?.serviceName ?? config.patientServiceName;
  const projectId = opts?.projectId ?? config.projectId;
  const region = opts?.region ?? config.region;
  const baseFilter = [
    'resource.type="cloud_run_revision"',
    `resource.labels.service_name="${serviceName}"`,
    `resource.labels.location="${region}"`,
    opts?.filterExtra,
  ]
    .filter(Boolean)
    .join(" AND ");

  const res = await fetch("https://logging.googleapis.com/v2/entries:list", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      resourceNames: [`projects/${projectId}`],
      filter: baseFilter,
      orderBy: "timestamp desc",
      pageSize: opts?.pageSize ?? 40,
    }),
  });
  if (!res.ok) throw new Error(`Cloud Logging list failed (${res.status}): ${await res.text()}`);
  const body = (await res.json()) as { entries?: LogEntry[] };
  return (body.entries ?? []).map((e) => ({
    timestamp: e.timestamp,
    severity: e.severity,
    message: entryText(e),
    bodyLess: !hasMessageBody(e),
    revision: e.resource?.labels?.revision_name,
  }));
}

export async function queryServiceErrors(
  opts?: { pageSize?: number; serviceName?: string; projectId?: string; region?: string },
): Promise<Array<{ message: string; count: number }>> {
  const serviceName = opts?.serviceName ?? config.patientServiceName;
  const entries = await queryServiceLogs({
    filterExtra: "severity>=ERROR",
    pageSize: opts?.pageSize ?? 30,
    serviceName,
    projectId: opts?.projectId,
    region: opts?.region,
  });
  return groupErrorEntries(entries, serviceName);
}
