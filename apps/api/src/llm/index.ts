import { callVertex, callVertexWithTools } from "./vertex.js";
import {
  mockLlm,
  type FunctionDeclaration,
  type LlmContent,
  type LlmResult,
  type ToolChoiceMode,
} from "./types.js";
import { config } from "../config.js";

export async function generateText(opts: {
  model: string;
  system: string;
  prompt: string;
  mockText?: string;
}): Promise<LlmResult> {
  try {
    const live = await callVertex(opts.model, opts.system, opts.prompt);
    if (live) return live;
  } catch (err) {
    if (config.mode === "gcp") {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Vertex LLM call failed for model=${opts.model}: ${detail} (no mock fallback in MODE=gcp)`,
      );
    }
  }

  if (config.mode === "gcp") {
    throw new Error(
      `Vertex LLM call failed for model=${opts.model} (no mock fallback in MODE=gcp)`,
    );
  }
  return mockLlm(opts.model, opts.system, opts.prompt, opts.mockText);
}

export async function generateWithTools(opts: {
  model: string;
  system: string;
  contents: LlmContent[];
  tools: FunctionDeclaration[];
  toolChoice?: ToolChoiceMode;
  mockText?: string;
}): Promise<LlmResult> {
  try {
    const live = await callVertexWithTools(opts);
    if (live) return live;
  } catch (err) {
    if (config.mode === "gcp") {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Vertex function-calling failed for model=${opts.model}: ${detail} (no mock fallback in MODE=gcp)`,
      );
    }
  }

  if (config.mode === "gcp") {
    throw new Error(
      `Vertex function-calling failed for model=${opts.model} (no mock fallback in MODE=gcp)`,
    );
  }

  const prompt = opts.contents.map((c) => c.parts.map((p) => p.text ?? "").join("")).join("\n");
  return mockLlm(opts.model, opts.system, prompt, opts.mockText);
}

export type { LlmResult, LlmContent, FunctionDeclaration, ContentPart, ToolChoiceMode } from "./types.js";
