import { callVertex } from "./vertex.js";
import { mockLlm, type LlmResult } from "./types.js";

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
    console.warn("Vertex call failed, using mock:", err);
  }
  return mockLlm(opts.model, opts.system, opts.prompt, opts.mockText);
}

export type { LlmResult };
