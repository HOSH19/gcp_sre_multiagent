import { callVertex } from "./vertex.js";
import { mockLlm, type LlmResult } from "./types.js";
import { config } from "../config.js";

export async function generateText(opts: {
  model: string;
  system: string;
  prompt: string;
  mockText?: string;
}): Promise<LlmResult> {
  const live = await callVertex(opts.model, opts.system, opts.prompt);
  if (live) return live;

  if (config.mode === "gcp") {
    throw new Error(
      `Vertex LLM call failed for model=${opts.model} (no mock fallback in MODE=gcp)`,
    );
  }
  return mockLlm(opts.model, opts.system, opts.prompt, opts.mockText);
}

export type { LlmResult };
