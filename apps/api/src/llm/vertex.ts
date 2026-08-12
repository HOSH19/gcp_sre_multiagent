import { estimateCostUsd } from "@gcp-sre/shared";
import { config } from "../config.js";
import type { FunctionDeclaration, LlmContent, LlmResult, ToolChoiceMode } from "./types.js";

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

type VertexPart = {
  text?: string;
  functionCall?: { name?: string; args?: Record<string, unknown> };
};

type VertexResponse = {
  candidates?: Array<{ content?: { parts?: VertexPart[]; role?: string } }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
};

function vertexUrl(model: string): string {
  return `https://${config.vertexLocation}-aiplatform.googleapis.com/v1/projects/${config.projectId}/locations/${config.vertexLocation}/publishers/google/models/${model}:generateContent`;
}

function vertexFetchError(label: string, err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  const cause =
    err instanceof Error && err.cause instanceof Error
      ? ` (${err.cause.name}: ${err.cause.message})`
      : "";
  console.warn(label, msg + cause);
  throw new Error(`${label}: ${msg}${cause}`);
}

function vertexHttpError(label: string, status: number, body: string): never {
  const detail = body.slice(0, 500);
  console.warn(label, status, detail);
  throw new Error(`${label} HTTP ${status}: ${detail}`);
}

function toResult(model: string, data: VertexResponse, fallbackIn: number): LlmResult {
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p) => p.text ?? "").join("");
  const functionCalls = parts
    .filter((p) => p.functionCall?.name)
    .map((p) => ({
      name: p.functionCall!.name!,
      args: (p.functionCall!.args ?? {}) as Record<string, unknown>,
    }));
  const tokensIn = data.usageMetadata?.promptTokenCount ?? fallbackIn;
  const tokensOut =
    data.usageMetadata?.candidatesTokenCount ?? Math.max(1, Math.ceil((text.length || functionCalls.length * 32) / 4));
  return {
    text,
    tokensIn,
    tokensOut,
    costUsd: estimateCostUsd(model, tokensIn, tokensOut),
    model,
    mocked: false,
    functionCalls: functionCalls.length ? functionCalls : undefined,
  };
}

export async function callVertex(model: string, system: string, prompt: string): Promise<LlmResult | null> {
  if (config.mode !== "gcp") return null;
  const token = await accessToken();
  if (!token) return null;

  let res: Response;
  try {
    res = await fetch(vertexUrl(model), {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `${system}\n\n${prompt}` }] }],
      }),
      signal: AbortSignal.timeout(config.vertexFetchTimeoutMs),
    });
  } catch (err) {
    vertexFetchError("Vertex fetch failed", err);
  }
  if (!res.ok) {
    vertexHttpError("Vertex error", res.status, await res.text());
  }
  const data = (await res.json()) as VertexResponse;
  return toResult(model, data, Math.ceil((system.length + prompt.length) / 4));
}

/** Multi-turn generateContent with functionDeclarations (ReAct). */
export async function callVertexWithTools(opts: {
  model: string;
  system: string;
  contents: LlmContent[];
  tools: FunctionDeclaration[];
  /** Force / allow / disable function calls (default AUTO). */
  toolChoice?: ToolChoiceMode;
}): Promise<LlmResult | null> {
  if (config.mode !== "gcp") return null;
  const token = await accessToken();
  if (!token) return null;

  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: opts.contents.map((c) => ({
      role: c.role,
      parts: c.parts.map((p) => {
        if (p.functionCall) {
          return { functionCall: { name: p.functionCall.name, args: p.functionCall.args ?? {} } };
        }
        if (p.functionResponse) {
          return {
            functionResponse: {
              name: p.functionResponse.name,
              response: p.functionResponse.response,
            },
          };
        }
        return { text: p.text ?? "" };
      }),
    })),
  };

  if (opts.tools.length) {
    body.tools = [{ functionDeclarations: opts.tools }];
    body.toolConfig = {
      functionCallingConfig: {
        mode: opts.toolChoice ?? "AUTO",
      },
    };
  }

  let res: Response;
  try {
    res = await fetch(vertexUrl(opts.model), {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.vertexFetchTimeoutMs),
    });
  } catch (err) {
    vertexFetchError("Vertex tools fetch failed", err);
  }
  if (!res.ok) {
    vertexHttpError("Vertex tools error", res.status, await res.text());
  }
  const data = (await res.json()) as VertexResponse;
  const approxIn = Math.ceil(JSON.stringify(opts.contents).length / 4);
  return toResult(opts.model, data, approxIn);
}
