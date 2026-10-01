import { db } from "@/db";
import { geminiUsage } from "@/db/schema";
import { geminiCallCostUsd, type GeminiUsageMetadata } from "@/lib/geminiPricing";

export type GeminiUsagePurpose = "live_draft" | "backlog";

/** Who/what a Gemini call was for — passed down from the draft route or backlog refill. */
export type GeminiUsageContext = {
  purpose: GeminiUsagePurpose;
  businessId?: string | null;
  sessionId?: string | null;
  /** Shared by every attempt (primary, fallback, similarity retry) for one draft. */
  requestId?: string;
};

type RecordInput = GeminiUsageContext & {
  model: string;
  thinkingLevel: string | null;
  usage?: GeminiUsageMetadata;
  finishReason?: string;
  ok: boolean;
  error?: string;
  latencyMs: number;
};

/** Best-effort, fire-and-forget — never throws or delays the caller. */
export function recordGeminiUsage(input: RecordInput): void {
  const cost = geminiCallCostUsd(input.model, input.usage);
  void db
    .insert(geminiUsage)
    .values({
      businessId: input.businessId ?? null,
      sessionId: input.sessionId ?? null,
      requestId: input.requestId ?? null,
      purpose: input.purpose,
      model: input.model,
      thinkingLevel: input.thinkingLevel,
      promptTokens: input.usage?.promptTokenCount ?? null,
      outputTokens: input.usage?.candidatesTokenCount ?? null,
      thoughtTokens: input.usage?.thoughtsTokenCount ?? null,
      cachedTokens: input.usage?.cachedContentTokenCount ?? null,
      totalTokens: input.usage?.totalTokenCount ?? null,
      costUsd: cost == null ? null : cost.toFixed(8),
      latencyMs: input.latencyMs,
      ok: input.ok,
      finishReason: input.finishReason ?? null,
      error: input.error ? input.error.slice(0, 500) : null,
    })
    .catch((err) => {
      console.error("recordGeminiUsage failed", err);
    });
}
