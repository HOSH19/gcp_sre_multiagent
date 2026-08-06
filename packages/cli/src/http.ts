import { API_URL } from "./config.js";

/** JSON body returned by the investigation API. */
export type ApiJson = {
  run?: {
    id: string;
    status: string;
    costUsd?: number;
    scenario?: string;
    hypotheses?: Array<{ rootCauseLabel?: string }>;
    proposedRemediation?: { summary?: string } | null;
    report?: { eval?: unknown; healthAfter?: unknown };
  };
  runs?: Array<{
    id: string;
    status: string;
    scenario?: string;
    costUsd: number;
  }>;
};

/** GET/POST helper against the local or remote API. */
export async function api(path: string, init?: RequestInit): Promise<ApiJson> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as ApiJson;
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body)}`);
  return body;
}
