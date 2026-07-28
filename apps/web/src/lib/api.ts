import { API_URL, CHAOS_TOKEN, CHAOS_URL, type Run, type ScenarioId, type SoakJob } from "./types";

export async function fetchApiHealth(): Promise<string> {
  try {
    const j = await fetch(`${API_URL}/health`).then((r) => r.json());
    return `${j.mode} · ok`;
  } catch {
    return "unreachable";
  }
}

export async function fetchRun(id: string): Promise<Run> {
  const body = await fetch(`${API_URL}/runs/${id}`).then((r) => r.json());
  return body.run as Run;
}

export async function injectScenario(scenario: ScenarioId): Promise<void> {
  const res = await fetch(`${CHAOS_URL}/inject/${scenario}`, {
    method: "POST",
    headers: { "x-chaos-token": CHAOS_TOKEN },
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function startInvestigate(scenario: ScenarioId): Promise<Run> {
  const res = await fetch(`${API_URL}/investigate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scenario, inject: true }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? res.statusText);
  return body.run as Run;
}

export async function startSoak(): Promise<SoakJob> {
  const res = await fetch(`${API_URL}/soak`, { method: "POST" });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? res.statusText);
  return body.soak as SoakJob;
}

export async function fetchSoak(id: string): Promise<SoakJob> {
  const res = await fetch(`${API_URL}/soak/${id}`);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? res.statusText);
  return body.soak as SoakJob;
}

export async function decide(runId: string, decision: "approve" | "deny"): Promise<Run> {
  const res = await fetch(`${API_URL}/runs/${runId}/${decision}`, { method: "POST" });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? res.statusText);
  return body.run as Run;
}
