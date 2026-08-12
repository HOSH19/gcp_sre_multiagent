import { API_URL, type Run, type ScenarioId } from "./types";

async function parseJson(res: Response): Promise<{ error?: string; [k: string]: unknown }> {
  return res.json().catch(() => ({}));
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, init);
  } catch {
    throw new Error(
      "Network error talking to API (is `gcloud run services proxy web` still running on :8080?)",
    );
  }
  const body = await parseJson(res);
  if (!res.ok) throw new Error(body.error ?? res.statusText);
  return body as T;
}

export async function fetchRun(id: string): Promise<Run> {
  const body = await request<{ run: Run }>(`/runs/${id}`);
  return body.run;
}

/** Starts investigation with chaos inject bundled (inject-only removed). */
export async function startInvestigate(scenario: ScenarioId): Promise<Run> {
  const body = await request<{ run: Run }>("/investigate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scenario, inject: true }),
  });
  return body.run;
}

export async function decide(runId: string, decision: "approve" | "deny"): Promise<Run> {
  const body = await request<{ run: Run }>(`/runs/${runId}/${decision}`, { method: "POST" });
  return body.run;
}

export interface ResetLabResponse {
  ok: true;
  chaosReset: boolean;
  runsCleared: string[];
  leasesReleased: boolean;
}

export async function resetLab(): Promise<ResetLabResponse> {
  return request<ResetLabResponse>("/reset-lab", { method: "POST" });
}
