import { estimateCostUsd } from "@gcp-sre/shared";

export interface LlmResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  model: string;
  mocked: boolean;
  /** Present when the model requested tool calls instead of (or alongside) text. */
  functionCalls?: Array<{ name: string; args: Record<string, unknown> }>;
}

export interface ContentPart {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

export interface LlmContent {
  role: "user" | "model";
  parts: ContentPart[];
}

export interface FunctionDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export function mockLlm(model: string, system: string, prompt: string, mockText?: string): LlmResult {
  const text = mockText ?? JSON.stringify({ summary: "Local mock LLM response" });
  const tokensIn = Math.ceil((system.length + prompt.length) / 4);
  const tokensOut = Math.ceil(text.length / 4);
  return {
    text,
    tokensIn,
    tokensOut,
    costUsd: estimateCostUsd(model, tokensIn, tokensOut),
    model,
    mocked: true,
  };
}
