import { humanizeReview } from "@/lib/reviewHumanize";
import { recordGeminiUsage, type GeminiUsageContext } from "@/lib/geminiUsage";
import type { GeminiUsageMetadata } from "@/lib/geminiPricing";
import {
  draftTooSimilar,
  recentOpenings,
  truncateDraft,
} from "@/lib/reviewSimilarity";
import {
  pickVariation,
  pickVariationRetry,
  pickNoAnswerVariation,
  pickNoAnswerVariationRetry,
  answersAllowReturnMention,
  formatVoiceHardRules,
  formatLengthHardRule,
  LENGTH_BANDS,
  type QA,
  type VariationBundle,
} from "@/lib/reviewVariation";

export type GeminiDraftResult = {
  draftText: string;
  sentiment: "positive" | "neutral" | "negative";
};

const DEFAULT_MODEL = "gemini-3.6-flash";
const FALLBACK_MODEL = "gemini-3.5-flash-lite";
/** Per-model wall clock — keep short so live drafts can fall back before CF 503s. */
const GEMINI_TIMEOUT_MS = 8000;
/** Enough for anti-repetition without bloating the prompt. */
const MAX_RECENT_IN_PROMPT = 5;
const PATTERN_TRUNCATE = 200;

function outputTokenLimit(model: string, requested?: number): number {
  if (requested) return requested;
  // Thinking models spend part of the budget on internal reasoning tokens.
  return isGemini36Model(model) ? 2048 : 512;
}

function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = GEMINI_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timeout));
}

function getApiKey(): string | undefined {
  return process.env.GEMINI_API_KEY?.trim() || undefined;
}

export function isGeminiConfigured(): boolean {
  return Boolean(getApiKey());
}

function getModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
}

function isGemini36Model(model: string): boolean {
  return /gemini-3\.6/i.test(model);
}

function buildGenerationConfig(
  model: string,
  options?: GenerateOptions
): Record<string, unknown> {
  const generationConfig: Record<string, unknown> = {
    temperature: options?.temperature ?? 1,
    maxOutputTokens: outputTokenLimit(model, options?.maxOutputTokens),
  };
  if (options?.json) {
    generationConfig.responseMimeType = "application/json";
  }
  // Only 3.6 Flash uses thinkingLevel. Lite models reject thinkingBudget: 0.
  if (isGemini36Model(model)) {
    generationConfig.thinkingConfig = { thinkingLevel: "low" };
  }
  return generationConfig;
}

type GenerateOptions = {
  model?: string;
  json?: boolean;
  maxOutputTokens?: number;
  temperature?: number;
  /** When set, the call's tokens/cost are written to gemini_usage. */
  usage?: GeminiUsageContext;
};

async function generateGeminiTextForModel(
  prompt: string,
  model: string,
  options?: GenerateOptions
): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const generationConfig = buildGenerationConfig(model, options);
  const thinkingLevel =
    (generationConfig.thinkingConfig as { thinkingLevel?: string } | undefined)?.thinkingLevel ??
    null;

  const startedAt = Date.now();
  let usage: GeminiUsageMetadata | undefined;
  let finishReason: string | undefined;
  let ok = false;
  let errorMessage: string | undefined;

  try {
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(
        `Gemini API error (${model}): ${res.status}${errBody ? ` — ${errBody.slice(0, 200)}` : ""}`
      );
    }

    // Read as text first so truncated/corrupt bodies become a clear throw
    // (fallback models / backlog can recover) instead of a vague JSON parse error.
    const raw = await res.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(
        `Gemini returned invalid JSON (${model}, ${raw.length} bytes)`
      );
    }
    const data = parsed as {
      candidates?: Array<{
        content?: { parts?: { text?: string; thought?: boolean }[] };
        finishReason?: string;
      }>;
      usageMetadata?: GeminiUsageMetadata;
    };
    usage = data.usageMetadata;
    finishReason = data.candidates?.[0]?.finishReason;
    const text = extractAnswerText(data);

    if (!text) {
      throw new Error(
        `Gemini returned an empty response (${model})${finishReason ? ` (finishReason: ${finishReason})` : ""}`
      );
    }
    ok = true;
    return text;
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    if (options?.usage) {
      recordGeminiUsage({
        ...options.usage,
        model,
        thinkingLevel,
        usage,
        finishReason,
        ok,
        error: errorMessage,
        latencyMs: Date.now() - startedAt,
      });
    }
  }
}

/**
 * Low-level Gemini generateContent call with kiosk-review settings.
 * Tries the primary model first, then falls back to gemini-3.5-flash-lite on error.
 */
export async function generateGeminiText(
  prompt: string,
  options?: GenerateOptions
): Promise<string> {
  const primaryModel = options?.model ?? getModel();
  const models =
    primaryModel === FALLBACK_MODEL ? [primaryModel] : [primaryModel, FALLBACK_MODEL];

  let lastError: unknown;
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    try {
      return await generateGeminiTextForModel(prompt, model, options);
    } catch (err) {
      lastError = err;
      const nextModel = models[i + 1];
      if (nextModel) {
        console.warn(`Gemini model ${model} failed, trying ${nextModel}:`, err);
      }
    }
  }

  throw lastError;
}

type GeminiPart = { text?: string; thought?: boolean };

function extractAnswerText(data: {
  candidates?: Array<{ content?: { parts?: GeminiPart[] }; finishReason?: string }>;
}): string {
  const parts =
    data.candidates?.flatMap((c) => c.content?.parts ?? []) ?? [];

  const answerParts = parts
    .filter((p) => p.text && !p.thought)
    .map((p) => p.text ?? "");

  if (answerParts.length > 0) {
    return answerParts.join("").trim();
  }

  // Some models embed reasoning in normal text parts without part.thought.
  const raw = parts.map((p) => p.text ?? "").join("").trim();
  if (!raw) return "";

  const withoutThoughtBlock = raw
    .replace(/^THOUGHT:\s*[\s\S]*?(?=\n\s*(?:Answer:|{"draftText")|$)/i, "")
    .trim();

  return withoutThoughtBlock || raw;
}

export type BusinessContext = {
  name: string;
  category?: string | null;
  description?: string | null;
  reviewThemes?: string[] | null;
};

const SELECTIVE_CONTEXT_RULES = `
CONTEXT USAGE (important):
- From the background description, use at most ONE or TWO details when needed. Never list every product or service.
- Do not read the description like a menu or feature list.
- Vary what you highlight (a product, service, atmosphere, or staff) — not a polite "I'll be back" closer.`;

const BANNED_OPENERS = [
  "I recently visited",
  "I had the pleasure",
  "I had a great experience",
  "We recently visited",
  "My family and I",
  "If you're looking for",
  "Look no further",
  "From the moment we walked in",
  "From start to finish",
  "I cannot recommend",
  "I can't recommend enough",
  "Nestled in",
  "A must try",
  "A must-visit",
  "Stopped by this place",
  "Tried this place out",
  "Visited this place",
] as const;

const BANNED_PHRASES = [
  "hidden gem",
  "highly recommend",
  "highly recommended",
  "must try",
  "must visit",
  "must-try",
  "absolutely loved",
  "amazing experience",
  "exceptional service",
  "exceptional",
  "delightful",
  "five stars",
  "top notch",
  "top-notch",
  "went above and beyond",
  "above and beyond",
  "don't hesitate",
  "you won't be disappointed",
  "gem of a place",
  "can't wait to go back",
  "can't wait to come back",
  "will definitely be back",
  "will definitely come back",
  "would definitely come back",
  "will be visiting again",
  "will be back soon",
  "looking forward to visiting again",
  "looking forward to coming back",
  "see you soon",
  "until next time",
  "exceeded expectations",
  "perfect experience",
  "truly wonderful",
  "hands down",
  "cannot say enough",
  "can't say enough",
  "overall experience",
  "atmosphere was",
  "second to none",
] as const;

const BANNED_LANGUAGE_RULES = `
HARD RULE — do NOT open with these (or close variants):
${BANNED_OPENERS.map((o) => `- "${o}"`).join("\n")}

HARD RULE — do NOT use these words or phrases anywhere in the review:
${BANNED_PHRASES.map((p) => `- "${p}"`).join("\n")}

Prefer one plain specific detail from the answers over praise clichés.`;

const WRITE_LIKE_RULES = `
WRITE LIKE A REAL PERSON TYPING A QUICK NOTE (Indian English):
- Everyday spoken Indian English — how people actually write Google reviews in India
- Contractions where natural ("don't", "it's", "wasn't"); plain words like "quite good", "bit costly", "properly done", "staff was helpful" are fine
- Light local flavour ok if it fits naturally — one soft filler max ("only", "kinda", "a bit", "ya") — never stack slang, Hinglish parody, fake accent, or deliberate typos
- Avoid Americanisms ("awesome", "y'all", "stoked", "the bomb", "super cute")
- Imperfections are good: slightly messy wording, a fragment, trailing off, uneven punctuation
- Occasional lowercase start or missing final period is fine — do not polish every sentence
- Never use a neat 3-beat structure (setup + praise + closer)
- No corporate politeness or polished customer-service tone
- No em dashes or en dashes; no hyphenated compounds (write "well behaved" not "well-behaved")
- No semicolons or colons; simple punctuation only; avoid stacking exclamation marks
- NEVER use a rigid formula (opening + service note + closing)
- Do NOT invent menu items, staff names, or details not in the answers/context
- No emojis or hashtags`;

const ANSWER_GROUNDING_RULES = `
HARD RULE — ANSWER GROUNDING:
- Use 1 or 2 concrete details taken from the customer answers only
- Prefer what they actually said (a product, wait, staff moment, price note) over abstract praise
- Do NOT invent specifics that are not in the answers
- No generic praise loops that could fit any business ("great service, great food, great vibe")`;

const NO_RETURN_SIGN_OFF = `
HARD RULE — NO RETURN / REVISIT SIGNOFFS:
- Do NOT end with (or include) lines like "I'll be back", "will visit again", "would come back", "looking forward to coming back", "see you soon"
- Only mention returning if the customer's own answers clearly talk about coming back / visiting again`;

const CONSTRUCTIVE_TONE_RULES = `
WHEN FEEDBACK IS MIXED OR NEGATIVE (low stars, complaints, disappointment):
- Stay truthful to the answers — do NOT flip a bad experience into praise
- Calm and plain, not angry or dramatic — still everyday speech, not corporate soft-speak
- Prefer plain specifics ("wait was long", "food was cold") over insults ("terrible", "worst", "awful", "never again")
- No profanity, all-caps ranting, or attacks on staff by name
- Keep it short — state what went wrong without stacking complaints
- Sentiment label must still match reality (negative stays negative when the visit went poorly)`;

function formatBannedLanguageRules(): string {
  return BANNED_LANGUAGE_RULES;
}

function formatWriteRules(extraBullets: string[]): string {
  return `${WRITE_LIKE_RULES}\n${extraBullets.map((b) => `- ${b}`).join("\n")}`;
}

function limitRecents(recentDrafts: string[]): string[] {
  return recentDrafts.slice(0, MAX_RECENT_IN_PROMPT);
}

function formatBusinessContext(business: BusinessContext, highlightTheme?: string): string {
  const category = business.category?.trim() || "not specified";
  const description = business.description?.trim() || "not specified";
  const themes = (business.reviewThemes ?? []).filter((t) => t.trim());

  let block = `Business name: ${business.name}
Category: ${category}
Background (accuracy only, do NOT recite the full list): ${description}`;

  if (highlightTheme) {
    block += `\nHighlight for THIS draft (center the review on this angle): ${highlightTheme}`;
    const others = themes.filter((t) => t !== highlightTheme);
    if (others.length > 0) {
      block += `\nOther themes (do NOT feature these in this draft): ${others.join("; ")}`;
    }
  } else if (themes.length > 0) {
    block += `\nReview themes (reference only, pick one angle if answers leave room): ${themes.join("; ")}`;
  }

  return block;
}

function formatVariationBlock(variation: VariationBundle, noAnswers: boolean): string {
  const lines = [
    formatLengthHardRule(variation.lengthMode, variation.targetWords),
    variation.lengthMode === "short" ? `- Shape: ${variation.structureSeed}` : "",
    "",
    formatVoiceHardRules(variation.voice),
  ].filter(Boolean);
  if (!noAnswers) {
    lines.push(
      `- Lead with this answer as your opening focus: Q: ${variation.leadQa.question} / A: ${variation.leadQa.answer}`
    );
  }
  if (variation.contentFocusSeed) {
    lines.push(`- Content angle: ${variation.contentFocusSeed}`);
  }
  if (variation.highlightTheme) {
    lines.push(`- Primary highlight: ${variation.highlightTheme}`);
  }
  return lines.join("\n");
}

function lengthHintForLite(variation: VariationBundle): string {
  const band = LENGTH_BANDS[variation.lengthMode];
  if (variation.lengthMode === "single") {
    return `HARD: exactly one sentence, ${band.minWords}-${band.maxWords} words (aim ~${variation.targetWords}).`;
  }
  if (variation.lengthMode === "two_liner") {
    return `HARD: exactly two short lines/sentences, ${band.minWords}-${band.maxWords} words total (aim ~${variation.targetWords}).`;
  }
  return `HARD: ${band.minWords}-${band.maxWords} words, uneven multi-beat (aim ~${variation.targetWords}). Not one tiny sentence.`;
}

function formatRepetitionGuards(recentDrafts: string[]): string {
  const limited = limitRecents(recentDrafts);
  const openings = recentOpenings(limited);
  const truncatedRecents = limited.map((d) => truncateDraft(d, PATTERN_TRUNCATE));

  const openingBan =
    openings.length > 0
      ? `\nHARD RULE — do NOT reuse or closely mimic these recent opening lines:\n${openings.map((o) => `- "${o}"`).join("\n")}`
      : "";

  const patternBan =
    truncatedRecents.length > 0
      ? `\nRecent reviews at this business (do not reuse sentence patterns or distinctive phrases from these):\n${truncatedRecents.map((d, i) => `${i + 1}. "${d}"`).join("\n")}`
      : "";

  return `${openingBan}${patternBan}`;
}

function buildLiteNoAnswersPrompt(
  business: BusinessContext,
  variation: VariationBundle
): string {
  const v = variation.voice;
  return `Write a short Google review for ${business.name} in spoken Indian English. Contractions, imperfect ok. Not marketing.
${business.category ? `Business type: ${business.category}` : ""}
${variation.highlightTheme ? `Mention: ${variation.highlightTheme}` : ""}

${lengthHintForLite(variation)} First person. No "I'll be back" / visit-again closer.
VOICE (must be obvious): ${v.label}
Do: ${v.dos[0]}
Don't: ${v.donts[0]}

Respond ONLY with JSON: {"draftText":"...","sentiment":"positive|neutral|negative"}`;
}

function buildLiteReviewPrompt(
  business: BusinessContext,
  qas: QA[],
  variation: VariationBundle
): string {
  const returnHint = answersAllowReturnMention(qas)
    ? "Customer mentioned returning — you may briefly echo that."
    : 'Do NOT say you\'ll be back / visit again.';
  const v = variation.voice;
  return `Write a short Google review from these customer answers in spoken Indian English. Everyday speech, contractions, imperfect ok — not an essay.

Business: ${business.name}
${business.category ? `Type: ${business.category}` : ""}

Answers:
${qas.map((qa, i) => `${i + 1}. ${qa.question} → ${qa.answer}`).join("\n")}

${lengthHintForLite(variation)} Lead with: "${variation.leadQa.answer}". Use 1–2 concrete details from the answers only — no invented specifics, no generic praise loops. Match tone to star ratings. No marketing clichés.
VOICE (must be obvious): ${v.label}
Do: ${v.dos[0]}
Don't: ${v.donts[0]}
${returnHint}
If feedback is negative or mixed: stay truthful but calm — plain specifics, no insults. Do not rewrite a bad visit as praise.

Respond ONLY with JSON: {"draftText":"...","sentiment":"positive|neutral|negative"}`;
}

function buildNoAnswersPrompt(
  business: BusinessContext,
  variation: VariationBundle,
  recentDrafts: string[]
): string {
  return `You are drafting a Google review for this business. The customer did not answer any questions — write a short, genuine positive note grounded in the business context below.

${formatBusinessContext(business, variation.highlightTheme)}

VARIATION FOR THIS DRAFT (follow these):
${formatVariationBlock(variation, true)}
${formatRepetitionGuards(recentDrafts)}
${SELECTIVE_CONTEXT_RULES}
${formatBannedLanguageRules()}
${NO_RETURN_SIGN_OFF}
${formatWriteRules([
  "Keep it positive and believable without corporate politeness",
  "Stay true to the category and description — do not mention meals, dinner, or restaurant vibes unless that fits this business",
  "Do not invent specific menu items, staff names, or details beyond the context above",
  "Never use opening + praise + I'll-be-back formula",
  "Spoken Indian English — not American review-speak",
  "Obey the HARD RULE — LENGTH block exactly (word count + sentence/line shape)",
])}

Then classify overall sentiment as exactly one word: positive, neutral, or negative.

Respond ONLY with JSON in this exact shape, no markdown fences, no preamble:
{"draftText": "...", "sentiment": "positive"}`;
}

function buildReviewPrompt(
  business: BusinessContext,
  qas: QA[],
  variation: VariationBundle,
  recentDrafts: string[]
): string {
  const allowReturn = answersAllowReturnMention(qas);
  return `You are drafting a Google review for this business from a real customer's quick answers.

${formatBusinessContext(business)}

CUSTOMER ANSWERS:
${qas.map((qa, i) => `${i + 1}. Q: ${qa.question}\n   A: ${qa.answer}`).join("\n")}

VARIATION FOR THIS DRAFT (follow these — customer did not choose them):
${formatVariationBlock(variation, false)}
${formatRepetitionGuards(recentDrafts)}
${SELECTIVE_CONTEXT_RULES}
${formatBannedLanguageRules()}
${allowReturn ? "" : NO_RETURN_SIGN_OFF}
${CONSTRUCTIVE_TONE_RULES}
${ANSWER_GROUNDING_RULES}
${formatWriteRules([
  "Match tone honestly to star ratings in the answers",
  "Always stay true to the business category and description above — do not mention meals, dinner, or restaurant vibes unless that fits this business",
  "Spoken Indian English — not American review-speak",
  allowReturn
    ? "Customer answers mention returning — a brief natural echo is ok, not a corporate closer"
    : "Do not add any return / visit-again signoff",
  "Obey the HARD RULE — LENGTH block exactly (word count + sentence/line shape)",
  variation.lengthMode === "single"
    ? "Write exactly one casual sentence — no wrap-up"
    : variation.lengthMode === "two_liner"
      ? "Write two short uneven lines — ok if they feel a bit disconnected"
      : "Keep shape uneven — never opening + service note + closing; stay in the word band",
])}

Then classify overall sentiment as exactly one word: positive, neutral, or negative.

Respond ONLY with JSON in this exact shape, no markdown fences, no preamble:
{"draftText": "...", "sentiment": "positive"}`;
}

function parseDraftJson(text: string): GeminiDraftResult {
  const cleaned = text.replace(/^```json\s*|```$/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    const sentiment = parsed.sentiment as GeminiDraftResult["sentiment"];
    const draftText = humanizeReview(String(parsed.draftText ?? ""));
    if (!["positive", "neutral", "negative"].includes(sentiment)) {
      return { draftText, sentiment: "neutral" };
    }
    return { draftText, sentiment };
  } catch {
    return { draftText: humanizeReview(cleaned), sentiment: "neutral" };
  }
}

async function generateOnce(
  business: BusinessContext,
  qas: QA[],
  variation: VariationBundle,
  recentDrafts: string[],
  usage: GeminiUsageContext
): Promise<GeminiDraftResult> {
  const hasAnswers = qas.some((qa) => qa.answer.trim());
  const fullPrompt = hasAnswers
    ? buildReviewPrompt(business, qas, variation, recentDrafts)
    : buildNoAnswersPrompt(business, variation, recentDrafts);
  const litePrompt = hasAnswers
    ? buildLiteReviewPrompt(business, qas, variation)
    : buildLiteNoAnswersPrompt(business, variation);

  const primaryModel = getModel();
  const attempts: { model: string; prompt: string }[] = [
    { model: primaryModel, prompt: fullPrompt },
  ];
  if (primaryModel !== FALLBACK_MODEL) {
    attempts.push({ model: FALLBACK_MODEL, prompt: litePrompt });
  }

  let lastError: unknown;
  for (let i = 0; i < attempts.length; i++) {
    const { model, prompt } = attempts[i];
    try {
      const text = await generateGeminiTextForModel(prompt, model, {
        json: true,
        temperature: 1,
        usage,
      });
      return parseDraftJson(text);
    } catch (err) {
      lastError = err;
      const next = attempts[i + 1];
      if (next) {
        console.warn(`Gemini model ${model} failed, trying ${next.model}:`, err);
      }
    }
  }

  throw lastError;
}

/**
 * Gemini kiosk-style review draft with random variation and optional anti-repetition retry.
 * Length is enforced only via the first prompt (no length re-rolls — keeps latency down).
 */
export async function draftReviewWithGemini(
  business: BusinessContext,
  qas: QA[],
  recentDrafts: string[] = [],
  options?: {
    antiRepeatRetry?: boolean;
    businessId?: string | null;
    sessionId?: string | null;
  }
): Promise<GeminiDraftResult> {
  const hasAnswers = qas.some((qa) => qa.answer.trim());
  const themes = (business.reviewThemes ?? []).filter((t) => t.trim());
  const usage: GeminiUsageContext = {
    purpose: "live_draft",
    businessId: options?.businessId,
    sessionId: options?.sessionId,
    requestId: crypto.randomUUID(),
  };

  const variation = hasAnswers
    ? pickVariation(qas)
    : pickNoAnswerVariation(themes);

  let result = await generateOnce(business, qas, variation, recentDrafts, usage);

  // Live customer drafts skip the similarity re-roll — a second Gemini pass
  // often pushes Cloudflare Workers past the request time limit (HTTP 503).
  if (
    options?.antiRepeatRetry !== false &&
    recentDrafts.length > 0 &&
    draftTooSimilar(result.draftText, recentDrafts)
  ) {
    const retryVariation = hasAnswers
      ? pickVariationRetry(qas, variation)
      : pickNoAnswerVariationRetry(themes, variation);
    result = await generateOnce(business, qas, retryVariation, recentDrafts, usage);
  }

  return result;
}

/**
 * Pre-generate a backlog draft for a target sentiment (no real customer answers).
 */
export async function draftBacklogReviewWithGemini(
  business: BusinessContext,
  sentiment: "positive" | "neutral" | "negative",
  recentDrafts: string[] = [],
  businessId?: string | null
): Promise<GeminiDraftResult> {
  const usage: GeminiUsageContext = {
    purpose: "backlog",
    businessId,
    requestId: crypto.randomUUID(),
  };
  const themes = (business.reviewThemes ?? []).filter((t) => t.trim());
  const variation = pickNoAnswerVariation(themes);
  const tone =
    sentiment === "positive"
      ? "Write a short positive review. Friendly, understated, everyday speech. No I'll-be-back closer."
      : sentiment === "negative"
        ? "Write a short constructive negative review. Calm and specific (e.g. wait was long), not insulting. Do not praise the visit."
        : "Write a short mixed/neutral review. Okay but not great — something average about service, wait, or value.";

  const fullPrompt = `You are drafting a Google review for this business to keep as a standby fallback.
Target sentiment for THIS draft: ${sentiment}
${tone}

${formatBusinessContext(business, variation.highlightTheme)}

VARIATION FOR THIS DRAFT:
${formatVariationBlock(variation, true)}
${formatRepetitionGuards(recentDrafts)}
${SELECTIVE_CONTEXT_RULES}
${formatBannedLanguageRules()}
${NO_RETURN_SIGN_OFF}
${CONSTRUCTIVE_TONE_RULES}
${formatWriteRules([
  `Return sentiment exactly as "${sentiment}"`,
  "Stay true to the category and description — do not invent menu items or staff names",
  "Never use opening + praise + I'll-be-back formula",
  "Spoken Indian English — not American review-speak",
  "Obey the HARD RULE — LENGTH block exactly (word count + sentence/line shape)",
])}

Respond ONLY with JSON:
{"draftText": "...", "sentiment": "${sentiment}"}`;

  const litePrompt = `Write a short Google review for ${business.name} in spoken Indian English. Target sentiment: ${sentiment}.
${business.category ? `Type: ${business.category}` : ""}
${variation.highlightTheme ? `Angle: ${variation.highlightTheme}` : ""}
${tone}
${lengthHintForLite(variation)}
VOICE (must be obvious): ${variation.voice.label}
Do: ${variation.voice.dos[0]}
Don't: ${variation.voice.donts[0]}
Everyday speech with contractions. No visit-again closer.

Respond ONLY with JSON: {"draftText":"...","sentiment":"${sentiment}"}`;

  const primaryModel = getModel();
  const attempts: { model: string; prompt: string }[] = [
    { model: primaryModel, prompt: fullPrompt },
  ];
  if (primaryModel !== FALLBACK_MODEL) {
    attempts.push({ model: FALLBACK_MODEL, prompt: litePrompt });
  }

  let lastError: unknown;
  for (let i = 0; i < attempts.length; i++) {
    const { model, prompt } = attempts[i];
    try {
      const text = await generateGeminiTextForModel(prompt, model, {
        json: true,
        temperature: 1,
        usage,
      });
      const parsed = parseDraftJson(text);
      return { draftText: parsed.draftText, sentiment };
    } catch (err) {
      lastError = err;
      const next = attempts[i + 1];
      if (next) {
        console.warn(`Gemini backlog model ${model} failed, trying ${next.model}:`, err);
      }
    }
  }

  throw lastError;
}
