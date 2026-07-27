export const MODEL_FLASH_LITE = "gemini-2.0-flash-lite";
export const MODEL_FLASH = "gemini-2.0-flash";

export const MODEL_PRICING: Record<
  string,
  { inputPerMillion: number; outputPerMillion: number }
> = {
  [MODEL_FLASH_LITE]: { inputPerMillion: 0.075, outputPerMillion: 0.3 },
  [MODEL_FLASH]: { inputPerMillion: 0.15, outputPerMillion: 0.6 },
};

export function estimateCostUsd(model: string, tokensIn: number, tokensOut: number): number {
  const p = MODEL_PRICING[model] ?? MODEL_PRICING[MODEL_FLASH_LITE];
  return (tokensIn / 1e6) * p.inputPerMillion + (tokensOut / 1e6) * p.outputPerMillion;
}
