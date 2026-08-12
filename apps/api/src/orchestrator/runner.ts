import { AGENT_TOOLS, type EvidenceItem, type InvestigationRun, type Specialist } from "@gcp-sre/shared";
import { config } from "../config.js";
import { generateText } from "../llm/index.js";
import { appendEvent, saveRun, syncRunToFirestore } from "../store/index.js";
import { toolHandlers, type ToolName } from "../tools/index.js";
import { assertCaps } from "./caps.js";

function isEvidence(value: unknown): value is EvidenceItem {
  return Boolean(value && typeof value === "object" && "id" in value && "source" in value);
}

function modelFor(agent: Specialist): string {
  return agent === "hypothesis" || agent === "mitigator"
    ? config.flashModel
    : config.flashLiteModel;
}

export async function runTool(
  run: InvestigationRun,
  agent: Specialist,
  tool: string,
  args?: Record<string, unknown>,
): Promise<unknown> {
  if (!AGENT_TOOLS[agent].includes(tool)) throw new Error(`tool ${tool} not allowed for ${agent}`);
  run.toolCallCount += 1;
  assertCaps(run);
  const started = Date.now();
  await appendEvent(run.id, {
    agent,
    type: "tool_call",
    message: `Calling ${tool}`,
    data: args ? { tool, args } : { tool },
  });

  const handler = toolHandlers[tool as ToolName];
  if (!handler) throw new Error(`unknown tool ${tool}`);

  let result: unknown;
  try {
    result = await handler({ run, args });
  } catch (err) {
    const durationMs = Date.now() - started;
    const error = err instanceof Error ? err.message : String(err);
    await appendEvent(run.id, {
      agent,
      type: "tool_result",
      message: `Error from ${tool}`,
      data: { tool, durationMs, ok: false, error },
    });
    console.info(
      JSON.stringify({ event: "tool_call", runId: run.id, agent, tool, durationMs, ok: false, error }),
    );
    await saveRun(run);
    await syncRunToFirestore(run);
    throw err;
  }

  const durationMs = Date.now() - started;
  if (isEvidence(result)) run.evidence.push(result);
  await appendEvent(run.id, {
    agent,
    type: "tool_result",
    message: `Result from ${tool}`,
    data: {
      tool,
      durationMs,
      ok: true,
      summary: isEvidence(result) ? result.summary : undefined,
      result,
    },
  });
  console.info(JSON.stringify({ event: "tool_call", runId: run.id, agent, tool, durationMs, ok: true }));
  await saveRun(run);
  await syncRunToFirestore(run);
  return result;
}

export async function llmStep(
  run: InvestigationRun,
  agent: Specialist,
  system: string,
  prompt: string,
  mockText: string,
): Promise<string> {
  assertCaps(run);
  run.stepCount += 1;
  const model = modelFor(agent);
  const result = await generateText({ model, system, prompt, mockText });
  await appendEvent(run.id, {
    agent,
    type: "thought",
    message: result.text.slice(0, 2000),
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    costUsdDelta: result.costUsd,
    data: { model, mocked: result.mocked },
  });
  await saveRun(run);
  return result.text;
}
