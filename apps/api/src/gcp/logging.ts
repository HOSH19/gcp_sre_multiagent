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

function entryText(entry: LogEntry): string {
  if (entry.textPayload) return entry.textPayload;
  if (entry.jsonPayload) {
    const msg = entry.jsonPayload.message ?? entry.jsonPayload.msg ?? entry.jsonPayload.error;
    if (typeof msg === "string") return msg;
    return JSON.stringify(entry.jsonPayload);
  }
  return "(empty)";
}

export async function queryServiceLogs(opts?: {
  filterExtra?: string;
  pageSize?: number;
  serviceName?: string;
  projectId?: string;
  region?: string;
}): Promise<Array<{ timestamp?: string; severity?: string; message: string; revision?: string }>> {
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
    revision: e.resource?.labels?.revision_name,
  }));
}

export async function queryServiceErrors(
  opts?: { pageSize?: number; serviceName?: string; projectId?: string; region?: string },
): Promise<Array<{ message: string; count: number }>> {
  const entries = await queryServiceLogs({
    filterExtra: "severity>=ERROR",
    pageSize: opts?.pageSize ?? 30,
    serviceName: opts?.serviceName,
    projectId: opts?.projectId,
    region: opts?.region,
  });
  const counts = new Map<string, number>();
  for (const e of entries) {
    const key = e.message.slice(0, 200);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const errors = [...counts.entries()].map(([message, count]) => ({ message, count }));
  if (!errors.length) return [{ message: "No recent error-severity log entries", count: 0 }];
  return errors;
}
