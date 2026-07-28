export const MODEL_FLASH_LITE = "gemini-2.5-flash-lite";
export const MODEL_FLASH = "gemini-2.5-flash";

export const MODEL_PRICING: Record<
  string,
  { inputPerMillion: number; outputPerMillion: number }
> = {
  [MODEL_FLASH_LITE]: { inputPerMillion: 0.1, outputPerMillion: 0.4 },
  [MODEL_FLASH]: { inputPerMillion: 0.3, outputPerMillion: 2.5 },
};

export function estimateCostUsd(model: string, tokensIn: number, tokensOut: number): number {
  const p = MODEL_PRICING[model] ?? MODEL_PRICING[MODEL_FLASH_LITE];
  return (tokensIn / 1e6) * p.inputPerMillion + (tokensOut / 1e6) * p.outputPerMillion;
}
