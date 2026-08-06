import type { InvestigationRun } from "@gcp-sre/shared";
import { config } from "../config.js";
import { runReactAgent } from "./react.js";
import { llmStep, runTool } from "./runner.js";

async function runDetectorDeterministic(run: InvestigationRun): Promise<void> {
  await llmStep(
    run,
    "detector",
    "You are Detector, an SRE agent. The demo Cloud Run service is nicknamed 'patient' (not a medical patient). In 1-2 sentences, say you will check health, recent errors, and uptime. Do not ask the user questions.",
    `Service=${run.targetService ?? run.patientService}`,
    "I will verify Cloud Run patient health, recent errors, and uptime check state.",
  );
  await runTool(run, "detector", "getServiceHealth");
  await runTool(run, "detector", "listRecentErrors");
  await runTool(run, "detector", "getUptimeCheckState");
  await runTool(run, "detector", "listCloudRunServices");
}

async function runDetectorReact(run: InvestigationRun): Promise<void> {
  await runReactAgent({
    run,
    agent: "detector",
    system: [
      "You are Detector, an SRE agent investigating a Cloud Run incident.",
      "CRITICAL: Invoke tools via function calling (functionCall), never by naming them in prose.",
      "Call getServiceHealth, listRecentErrors, getUptimeCheckState, and listCloudRunServices (each once, any order).",
      "Do not write a plan as text — emit function calls immediately. Do not ask questions.",
    ].join(" "),
    userPrompt: `Investigate service=${run.targetService ?? run.patientService} project=${run.projectId ?? "unknown"} region=${run.region ?? "unknown"}. Use function calls now.`,
    terminalTools: [],
    maxTurns: 8,
    maxToollessTurns: 3,
    mockFinalText: "Checked health, recent errors, and uptime.",
  });
}

export async function runDetector(run: InvestigationRun): Promise<void> {
  if (config.reactEnabled) await runDetectorReact(run);
  else await runDetectorDeterministic(run);
}
