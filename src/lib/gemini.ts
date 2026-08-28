import { humanizeReview } from "@/lib/reviewHumanize";
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
  type QA,
  type VariationBundle,
} from "@/lib/reviewVariation";

export type GeminiDraftResult = {
  draftText: string;
  sentiment: "positive" | "neutral" | "negative";
};

const DEFAULT_MODEL = "gemini-3.6-flash";
const GEMINI_TIMEOUT_MS = 22000;
/** Enough for anti-repetition without bloating the prompt. */
const MAX_RECENT_IN_PROMPT = 5;
const PATTERN_TRUNCATE = 200;

function outputTokenLimit(model: string, requested?: number): number {
  if (requested) return requested;
  // Thinking models spend part of the budget on internal reasoning tokens.
  return isGemini3Model(model) ? 2048 : 512;
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

function isGemini3Model(model: string): boolean {
  return /gemini-3/i.test(model);
}

type GenerateOptions = {
  model?: string;
  json?: boolean;
  maxOutputTokens?: number;
  temperature?: number;
};

/**
 * Low-level Gemini generateContent call with kiosk-review settings.
 */
export async function generateGeminiText(
  prompt: string,
  options?: GenerateOptions
): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }

  const model = options?.model ?? getModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const generationConfig: Record<string, unknown> = {
    temperature: options?.temperature ?? 1,
    maxOutputTokens: outputTokenLimit(model, options?.maxOutputTokens),
  };
  if (options?.json) {
    generationConfig.responseMimeType = "application/json";
  }
  if (isGemini3Model(model)) {
    generationConfig.thinkingConfig = { thinkingLevel: "low" };
  } else {
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }

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
      `Gemini API error: ${res.status}${errBody ? ` — ${errBody.slice(0, 200)}` : ""}`
    );
  }

  const data = await res.json();
  const text = extractAnswerText(data);

  if (!text) {
    const finishReason = (data.candidates?.[0] as { finishReason?: string } | undefined)?.finishReason;
    throw new Error(
      `Gemini returned an empty response${finishReason ? ` (finishReason: ${finishReason})` : ""}`
    );
  }
  return text;
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
- Vary what you highlight across reviews (a product, service, atmosphere, staff, or would come back).`;

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
  "will definitely be back",
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
WRITE LIKE A REAL PERSON, NOT MARKETING:
- First person, conversational — like a quick note, not an essay
- Use contractions ("don't", "it's", "we'd")
- No em dashes or en dashes; no hyphenated compounds (write "well behaved" not "well-behaved")
- No semicolons or colons; simple punctuation only
- Vary sentence length; short fragments are fine
- Sound understated when ratings are good — "pretty good", "glad we came" beats gushing
- Only use facts from the answers and business context — do not invent menu items, staff names, or details
- No emojis or hashtags`;

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
    `- Target length: about ${variation.targetWords} words (not longer)`,
    `- Structure: ${variation.structureSeed}`,
    `- Voice: ${variation.voiceSeed}`,
  ];
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

function buildNoAnswersPrompt(
  business: BusinessContext,
  variation: VariationBundle,
  recentDrafts: string[]
): string {
  return `You are drafting a Google review for this business. The customer did not answer any questions — write a short, genuine positive review grounded in the business context below.

${formatBusinessContext(business, variation.highlightTheme)}

VARIATION FOR THIS DRAFT (follow these):
${formatVariationBlock(variation, true)}
${formatRepetitionGuards(recentDrafts)}
${SELECTIVE_CONTEXT_RULES}
${formatBannedLanguageRules()}
${formatWriteRules([
  "Keep it positive and believable — friendly staff, good experience, would return",
  "Stay true to the category and description — do not mention meals, dinner, or restaurant vibes unless that fits this business",
  "Do not invent specific menu items, staff names, or details beyond the context above",
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
  return `You are drafting a Google review for this business from a real customer's quick answers.

${formatBusinessContext(business)}

CUSTOMER ANSWERS:
${qas.map((qa, i) => `${i + 1}. Q: ${qa.question}\n   A: ${qa.answer}`).join("\n")}

VARIATION FOR THIS DRAFT (follow these — customer did not choose them):
${formatVariationBlock(variation, false)}
${formatRepetitionGuards(recentDrafts)}
${SELECTIVE_CONTEXT_RULES}
${formatBannedLanguageRules()}
${formatWriteRules([
  "Match tone honestly to star ratings in the answers",
  "Always stay true to the business category and description above — do not mention meals, dinner, or restaurant vibes unless that fits this business",
  "No emojis or hashtags unless the customer's vibe clearly suggests it",
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
  recentDrafts: string[]
): Promise<GeminiDraftResult> {
  const hasAnswers = qas.some((qa) => qa.answer.trim());
  const prompt = hasAnswers
    ? buildReviewPrompt(business, qas, variation, recentDrafts)
    : buildNoAnswersPrompt(business, variation, recentDrafts);
  const text = await generateGeminiText(prompt, {
    json: true,
    temperature: 1,
  });
  return parseDraftJson(text);
}

/**
 * Gemini kiosk-style review draft with random variation and anti-repetition retry.
 */
export async function draftReviewWithGemini(
  business: BusinessContext,
  qas: QA[],
  recentDrafts: string[] = []
): Promise<GeminiDraftResult> {
  const hasAnswers = qas.some((qa) => qa.answer.trim());
  const themes = (business.reviewThemes ?? []).filter((t) => t.trim());

  const variation = hasAnswers
    ? pickVariation(qas)
    : pickNoAnswerVariation(themes);

  let result = await generateOnce(business, qas, variation, recentDrafts);

  if (recentDrafts.length > 0 && draftTooSimilar(result.draftText, recentDrafts)) {
    const retryVariation = hasAnswers
      ? pickVariationRetry(qas, variation)
      : pickNoAnswerVariationRetry(themes, variation);
    result = await generateOnce(business, qas, retryVariation, recentDrafts);
  }

  return result;
}
