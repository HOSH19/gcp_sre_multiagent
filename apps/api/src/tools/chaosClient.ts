import { config } from "../config.js";

export async function chaosFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${config.chaosControllerUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-chaos-token": config.chaosAdminToken,
      ...(init?.headers ?? {}),
    },
  });
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
