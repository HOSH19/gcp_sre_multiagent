import { AGENT_TOOLS, type InvestigationRun, type Specialist } from "@gcp-sre/shared";
import { config } from "../config.js";
import { generateWithTools, type LlmContent, type ToolChoiceMode } from "../llm/index.js";
import { appendEvent, saveRun } from "../store/index.js";
import { toolDeclarations } from "../tools/schemas.js";
import { assertCaps } from "./caps.js";
import { runTool } from "./runner.js";

const DEFAULT_MAX_TURNS = 8;
const DEFAULT_MAX_TOOLLESS = 3;

function modelFor(agent: Specialist): string {
  return agent === "hypothesis" || agent === "mitigator" ? config.flashModel : config.flashLiteModel;
}

function safeResponsePayload(result: unknown): Record<string, unknown> {
  if (result == null) return { ok: true };
  if (typeof result === "object") {
    try {
      const json = JSON.stringify(result);
      if (json.length > 12_000) {
        return { truncated: true, preview: json.slice(0, 4000) };
      }
      return result as Record<string, unknown>;
    } catch {
      return { ok: true, note: "non-serializable result" };
    }
  }
  return { value: String(result) };
}

export interface ReactAgentOpts {
  run: InvestigationRun;
  agent: Specialist;
  system: string;
  userPrompt: string;
  /** Override allowlist; defaults to AGENT_TOOLS[agent]. */
  tools?: string[];
  maxTurns?: number;
  /**
   * Consecutive text-only turns (no functionCall) before giving up.
   * Deterministic fallback at the agent layer remains the last resort.
   */
  maxToollessTurns?: number;
  mockFinalText?: string;
  /**
   * When any of these tools succeeds, stop the loop (even if the model wants more calls).
   * Typical: submitHypotheses, proposeRemediation.
   */
  terminalTools?: string[];
  /** Extra args merged into every runTool call (e.g. Scribe decision/cost). */
  toolArgs?: Record<string, unknown>;
}

function stillNeedsTools(
  allowed: string[],
  toolsCalled: string[],
  terminal: Set<string>,
): boolean {
  if (terminal.size > 0) {
    return !toolsCalled.some((t) => terminal.has(t));
  }
  return allowed.some((t) => !toolsCalled.includes(t));
}

function nudgeForMissingTools(allowed: string[], toolsCalled: string[], terminal: Set<string>): string {
  if (terminal.size > 0) {
    const needed = [...terminal].filter((t) => !toolsCalled.includes(t));
    return [
      "Do not reply with plain text. You must invoke tools via function calling.",
      `Call one of these required tools now: ${needed.join(", ")}.`,
      "Listing tool names in prose does not count.",
    ].join(" ");
  }
  const missing = allowed.filter((t) => !toolsCalled.includes(t));
  return [
    "Do not reply with plain text. You must invoke tools via function calling.",
    `Still need function calls for: ${missing.join(", ")}.`,
    "Listing tool names in prose does not count — emit functionCall parts.",
  ].join(" ");
}

/**
 * Open ReAct loop: Vertex function calling until tools complete, terminal tool, or caps.
 * Text-only turns while tools are still required nudge + continue (with mode ANY);
 * deterministic agent fallback is only after maxToollessTurns failures.
 */
export async function runReactAgent(opts: ReactAgentOpts): Promise<{ text: string; toolsCalled: string[] }> {
  const {
    run,
    agent,
    system,
    userPrompt,
    maxTurns = DEFAULT_MAX_TURNS,
    maxToollessTurns = DEFAULT_MAX_TOOLLESS,
    mockFinalText,
    terminalTools = [],
    toolArgs,
  } = opts;
  const allowed = opts.tools ?? AGENT_TOOLS[agent];
  const terminal = new Set(terminalTools);
  const declarations = toolDeclarations(allowed);
  const toolsCalled: string[] = [];

  const contents: LlmContent[] = [{ role: "user", parts: [{ text: userPrompt }] }];
  let lastText = "";
  let toollessStreak = 0;

  for (let turn = 0; turn < maxTurns; turn++) {
    assertCaps(run);
    run.stepCount += 1;

    const needsTools = stillNeedsTools(allowed, toolsCalled, terminal);
    const toolChoice: ToolChoiceMode = needsTools ? "ANY" : "AUTO";

    const result = await generateWithTools({
      model: modelFor(agent),
      system,
      contents,
      tools: declarations,
      toolChoice,
      mockText: mockFinalText,
    });

    await appendEvent(run.id, {
      agent,
      type: "thought",
      message: (result.text || (result.functionCalls?.length ? `[functionCall] ${result.functionCalls.map((c) => c.name).join(", ")}` : "")).slice(0, 2000),
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsdDelta: result.costUsd,
      data: {
        model: result.model,
        mocked: result.mocked,
        turn,
        toolChoice,
        functionCalls: result.functionCalls?.map((c) => c.name),
      },
    });

    lastText = result.text;
    const calls = result.functionCalls ?? [];

    if (!calls.length) {
      if (!needsTools) {
        await saveRun(run);
        return { text: lastText, toolsCalled };
      }

      toollessStreak += 1;
      await appendEvent(run.id, {
        agent,
        type: "status",
        message: `ReAct text-only turn ${toollessStreak}/${maxToollessTurns} — forcing tool use`,
        data: { turn, toollessStreak, toolsCalled },
      });

      if (toollessStreak >= maxToollessTurns) {
        await saveRun(run);
        return { text: lastText, toolsCalled };
      }

      if (lastText.trim()) {
        contents.push({ role: "model", parts: [{ text: lastText }] });
      }
      contents.push({
        role: "user",
        parts: [{ text: nudgeForMissingTools(allowed, toolsCalled, terminal) }],
      });
      continue;
    }

    toollessStreak = 0;

    contents.push({
      role: "model",
      parts: calls.map((c) => ({ functionCall: { name: c.name, args: c.args } })),
    });

    const responseParts: LlmContent["parts"] = [];
    let hitTerminal = false;

    for (const call of calls) {
      if (!allowed.includes(call.name)) {
        responseParts.push({
          functionResponse: {
            name: call.name,
            response: { error: `tool ${call.name} not allowed for ${agent}` },
          },
        });
        continue;
      }

      const mergedArgs = { ...(toolArgs ?? {}), ...(call.args ?? {}) };
      let toolResult: unknown;
      try {
        toolResult = await runTool(run, agent, call.name, mergedArgs);
        toolsCalled.push(call.name);
        if (terminal.has(call.name)) hitTerminal = true;
      } catch (err) {
        toolResult = { error: err instanceof Error ? err.message : String(err) };
      }

      responseParts.push({
        functionResponse: {
          name: call.name,
          response: safeResponsePayload(toolResult),
        },
      });
    }

    contents.push({ role: "user", parts: responseParts });

    if (hitTerminal) {
      await saveRun(run);
      return { text: lastText, toolsCalled };
    }

    if (!stillNeedsTools(allowed, toolsCalled, terminal) && terminal.size === 0) {
      await saveRun(run);
      return { text: lastText, toolsCalled };
    }
  }

  await appendEvent(run.id, {
    agent,
    type: "status",
    message: `ReAct max turns (${maxTurns}) reached`,
    data: { toolsCalled },
  });
  await saveRun(run);
  return { text: lastText, toolsCalled };
}
