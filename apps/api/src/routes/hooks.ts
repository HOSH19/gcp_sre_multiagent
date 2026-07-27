import { Hono } from "hono";
import { SCENARIOS, type ScenarioId } from "@gcp-sre/shared";
import { config } from "../config.js";
import { startInvestigation } from "../orchestrator/index.js";
import { createRun } from "../store/index.js";

function parseScenario(envelope: {
  message?: { data?: string; attributes?: Record<string, string> };
} | null): ScenarioId {
  let scenario: ScenarioId = "http_500s";
  try {
    if (envelope?.message?.data) {
      const decoded = JSON.parse(Buffer.from(envelope.message.data, "base64").toString("utf8")) as {
        scenario?: ScenarioId;
        incident?: { condition?: { displayName?: string } };
      };
      const name = decoded.scenario ?? decoded.incident?.condition?.displayName ?? "";
      if (name.includes("revision")) scenario = "bad_revision_traffic";
      else if (name.includes("config") || name.includes("missing")) scenario = "missing_config";
      else if (name in SCENARIOS) scenario = name as ScenarioId;
    }
    if (envelope?.message?.attributes?.scenario) {
      scenario = envelope.message.attributes.scenario as ScenarioId;
    }
  } catch {
    /* default */
  }
  return scenario;
}

export function registerHookRoutes(app: Hono): void {
  app.post("/hooks/pubsub", async (c) => {
    const envelope = await c.req.json().catch(() => null);
    const scenario = parseScenario(envelope);
    try {
      const run = createRun({ trigger: "alert", scenario, patientService: config.patientServiceName });
      return c.json({ ok: true, run: await startInvestigation(run.id) });
    } catch (err) {
      return c.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 200);
    }
  });
}
