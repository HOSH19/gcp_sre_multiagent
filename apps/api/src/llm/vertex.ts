import { estimateCostUsd } from "@gcp-sre/shared";
import { config } from "../config.js";
import type { LlmResult } from "./types.js";

export async function callVertex(model: string, system: string, prompt: string): Promise<LlmResult | null> {
  const token = process.env.GCP_ACCESS_TOKEN;
  if (!token || config.mode !== "gcp") return null;
  const url = `https://${config.vertexLocation}-aiplatform.googleapis.com/v1/projects/${config.projectId}/locations/${config.vertexLocation}/publishers/google/models/${model}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: `${system}\n\n${prompt}` }] }] }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  const tokensIn = data.usageMetadata?.promptTokenCount ?? Math.ceil(prompt.length / 4);
  const tokensOut = data.usageMetadata?.candidatesTokenCount ?? Math.ceil(text.length / 4);
  return { text, tokensIn, tokensOut, costUsd: estimateCostUsd(model, tokensIn, tokensOut), model, mocked: false };
}
