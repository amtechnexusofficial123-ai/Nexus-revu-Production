/**
 * Gemini API paid-tier (Standard) prices in USD per 1M tokens.
 * Source: https://ai.google.dev/gemini-api/docs/pricing (checked 2026-09-30).
 * Output price includes thinking tokens. Update this table when Google changes prices.
 */
type ModelPrice = {
  inputPerM: number;
  cachedInputPerM: number;
  outputPerM: number;
};

/** Newest window first; a window applies from `from` (UTC) onward. */
type PriceWindow = ModelPrice & { from?: string };

const PRICES: Record<string, PriceWindow[]> = {
  "gemini-3.6-flash": [
    { from: "2027-01-01T00:00:00Z", inputPerM: 1.5, cachedInputPerM: 0.15, outputPerM: 7.5 },
    { inputPerM: 0.75, cachedInputPerM: 0.075, outputPerM: 3.75 },
  ],
  "gemini-3.5-flash-lite": [
    { inputPerM: 0.3, cachedInputPerM: 0.03, outputPerM: 2.5 },
  ],
};

export type GeminiUsageMetadata = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  cachedContentTokenCount?: number;
  totalTokenCount?: number;
};

function priceFor(model: string, at: Date): ModelPrice | null {
  const windows = PRICES[model.replace(/^models\//, "")];
  if (!windows) return null;
  return (
    windows.find((w) => !w.from || at.getTime() >= new Date(w.from).getTime()) ?? null
  );
}

/** Null when the model has no price entry (e.g. a GEMINI_MODEL override). */
export function geminiCallCostUsd(
  model: string,
  usage: GeminiUsageMetadata | undefined,
  at: Date = new Date()
): number | null {
  if (!usage) return null;
  const price = priceFor(model, at);
  if (!price) return null;

  // promptTokenCount already includes the cached portion.
  const prompt = usage.promptTokenCount ?? 0;
  const cached = usage.cachedContentTokenCount ?? 0;
  const output = (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0);

  return (
    (Math.max(0, prompt - cached) * price.inputPerM +
      cached * price.cachedInputPerM +
      output * price.outputPerM) /
    1_000_000
  );
}
