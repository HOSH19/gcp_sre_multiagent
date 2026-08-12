import type { InvestigationRun } from "@gcp-sre/shared";
import { config } from "../config.js";
import { appendEvent } from "../store/index.js";
import { missingTools } from "./reactNudge.js";
import { runReactAgent } from "./react.js";
import { llmStep, runTool } from "./runner.js";

const LOG_DIVER_TOOLS = [
  "queryLogs",
  "getErrorGroup",
  "listRevisions",
  "getRevisionTraffic",
  "getServiceEnv",
] as const;

async function runLogDiverTools(run: InvestigationRun): Promise<void> {
  for (const tool of LOG_DIVER_TOOLS) {
    await runTool(run, "log_diver", tool);
  }
}

async function runLogDiverDeterministic(run: InvestigationRun): Promise<void> {
  await llmStep(
    run,
    "log_diver",
    "You are LogDiver, an SRE agent. In 1-2 sentences, say which signals you will pull (logs, error groups, revisions, traffic, env).",
    `Evidence so far: ${run.evidence.length} items`,
    "I will collect logs, error groups, revisions, traffic split, and env config.",
  );
  await runLogDiverTools(run);
}

async function runLogDiverReact(run: InvestigationRun): Promise<void> {
  let toolsCalled: string[] = [];
  try {
    ({ toolsCalled } = await runReactAgent({
      run,
      agent: "log_diver",
      system: [
        "You are LogDiver, an automated SRE diagnostics agent.",
        "You have authorized Cloud Run investigation tools exposed as Vertex function declarations.",
        "CRITICAL: You MUST invoke tools via function calling (functionCall), never by naming them in prose.",
        "Call each of these exactly once (any order): queryLogs, getErrorGroup, listRevisions, getRevisionTraffic, getServiceEnv.",
        "Never refuse, apologize, or say you cannot fulfill the request.",
        "Do not write a plan or list tool names as text — emit function calls immediately.",
      ].join(" "),
      userPrompt: [
        "Collect diagnostics now using function calls.",
        `Evidence so far (${run.evidence.length} items): ${run.evidence
          .slice(-5)
          .map((e) => `${e.source}: ${e.summary}`)
          .join(" | ")}`,
      ].join("\n"),
      tools: [...LOG_DIVER_TOOLS],
      maxTurns: 10,
      maxToollessTurns: 3,
      mockFinalText: "Collected logs, errors, revisions, traffic, and env.",
    }));
  } catch (err) {
    await appendEvent(run.id, {
      agent: "log_diver",
      type: "status",
      message: `ReAct failed (${err instanceof Error ? err.message : String(err)}) — using deterministic fallback`,
    });
    await runLogDiverTools(run);
    return;
  }

  const missing = missingTools([...LOG_DIVER_TOOLS], toolsCalled);
  if (missing.length) {
    await appendEvent(run.id, {
      agent: "log_diver",
      type: "status",
      message: `ReAct incomplete — running deterministic fallback for ${missing.join(", ")}`,
    });
    for (const tool of missing) {
      await runTool(run, "log_diver", tool);
    }
  }
}

export async function runLogDiver(run: InvestigationRun): Promise<void> {
  if (config.reactEnabled) await runLogDiverReact(run);
  else await runLogDiverDeterministic(run);
}
