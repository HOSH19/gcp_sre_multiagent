import { config } from "../config.js";

async function identityToken(audience: string): Promise<string | null> {
  if (process.env.GCP_IDENTITY_TOKEN) return process.env.GCP_IDENTITY_TOKEN;
  if (config.mode !== "gcp") return null;
  try {
    const url =
      "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity" +
      `?audience=${encodeURIComponent(audience)}`;
    const res = await fetch(url, { headers: { "Metadata-Flavor": "Google" } });
    if (!res.ok) return null;
    return (await res.text()).trim();
  } catch {
    return null;
  }
}

export async function chaosFetch(path: string, init?: RequestInit) {
  const base = config.chaosControllerUrl.replace(/\/$/, "");
  const token = await identityToken(base);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-chaos-token": config.chaosAdminToken,
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (token) headers.authorization = `Bearer ${token}`;

  const res = await fetch(`${base}${path}`, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

export async function chaosState() {
  const res = await chaosFetch("/state");
  return res.body as {
    activeScenario?: string | null;
    env?: Record<string, string>;
    traffic?: Record<string, number>;
    goodRevision?: string;
    badRevision?: string;
  };
}
