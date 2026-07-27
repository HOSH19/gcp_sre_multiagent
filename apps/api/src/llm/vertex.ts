import { estimateCostUsd } from "@gcp-sre/shared";
import { config } from "../config.js";
import type { LlmResult } from "./types.js";

async function accessToken(): Promise<string | null> {
  if (process.env.GCP_ACCESS_TOKEN) return process.env.GCP_ACCESS_TOKEN;
  try {
    const res = await fetch(
      "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
      { headers: { "Metadata-Flavor": "Google" } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string };
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

export async function callVertex(model: string, system: string, prompt: string): Promise<LlmResult | null> {
  if (config.mode !== "gcp") return null;
  const token = await accessToken();
  if (!token) return null;

  const url = `https://${config.vertexLocation}-aiplatform.googleapis.com/v1/projects/${config.projectId}/locations/${config.vertexLocation}/publishers/google/models/${model}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: `${system}\n\n${prompt}` }] }],
    }),
  });
  if (!res.ok) {
    console.warn("Vertex error", res.status, await res.text());
    return null;
  }
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  const tokensIn = data.usageMetadata?.promptTokenCount ?? Math.ceil(prompt.length / 4);
  const tokensOut = data.usageMetadata?.candidatesTokenCount ?? Math.ceil(text.length / 4);
  return {
    text,
    tokensIn,
    tokensOut,
    costUsd: estimateCostUsd(model, tokensIn, tokensOut),
    model,
    mocked: false,
  };
}
