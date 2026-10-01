type QA = { question: string; answer: string };

import { pickHighlightTheme } from "@/lib/reviewThemes";

type DraftResult = {
  draftText: string;
  sentiment: "positive" | "neutral" | "negative";
};

/**
 * Turns the customer's answers into a short review draft without any AI API.
 * Also estimates sentiment from star ratings when present.
 */
export function draftReview(
  businessName: string,
  qas: QA[],
  context?: {
    category?: string | null;
    description?: string | null;
    reviewThemes?: string[] | null;
  }
): DraftResult {
  const sentences = qas
    .map((qa) => formatQaSentence(qa))
    .filter(Boolean);

  if (sentences.length === 0) {
    const themes = (context?.reviewThemes ?? []).filter((t) => t.trim());
    const highlight = pickHighlightTheme(themes);
    const category = context?.category?.trim();
    let middle = "Friendly staff and a welcoming vibe";
    if (highlight) {
      middle = highlight.replace(/\.$/, "");
    } else if (category) {
      middle = `A solid ${category.toLowerCase()} spot`;
    }
    return {
      draftText: `Had a good time at ${businessName}. ${middle}`,
      sentiment: "positive",
    };
  }

  const draftText = [
    `I visited ${businessName}.`,
    ...sentences,
  ].join(" ");

  return { draftText, sentiment: estimateSentiment(qas) };
}

function formatQaSentence(qa: QA): string {
  const answer = qa.answer.trim();
  if (!answer) return "";

  // Rating answers look like "4 out of 5 stars"
  const ratingMatch = answer.match(/^(\d)\s+out of 5 stars$/i);
  if (ratingMatch) {
    return `I'd rate ${qa.question.replace(/\?$/, "").toLowerCase()} ${ratingMatch[1]}/5.`;
  }

  // Short choice / text answers — weave question + answer lightly
  const q = qa.question.replace(/\?$/, "").trim();
  return `Regarding ${q.toLowerCase()}: ${answer}.`;
}

export function estimateSentiment(qas: QA[]): DraftResult["sentiment"] {
  const ratings = qas
    .map((qa) => {
      const m = qa.answer.match(/^(\d)\s+out of 5 stars$/i);
      return m ? Number(m[1]) : null;
    })
    .filter((n): n is number => n !== null);

  if (ratings.length > 0) {
    const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    if (avg >= 4) return "positive";
    if (avg <= 2) return "negative";
    return "neutral";
  }

  const text = qas.map((qa) => qa.answer.toLowerCase()).join(" ");
  const negativeHints =
    /\b(bad|poor|slow|cold|rude|dirty|worst|awful|terrible|disappointed|never again|not good|overpriced)\b/;
  const positiveHints =
    /\b(great|good|amazing|loved|excellent|tasty|friendly|perfect|recommend|delicious)\b/;

  const neg = negativeHints.test(text);
  const pos = positiveHints.test(text);
  if (neg && !pos) return "negative";
  if (pos && !neg) return "positive";
  return "neutral";
}

/** How many questions to show: all if ≤3 in pool, otherwise always 3 random. */
export function pickQuestionCount(poolSize: number): number {
  if (poolSize <= 3) return poolSize;
  return 3;
}

type AlwaysAskable = { alwaysAsk?: boolean | null };

/**
 * Picks questions from the active pool. Any alwaysAsk question is included first,
 * then the rest are filled randomly up to the target count.
 */
export function pickRandomQuestions<T extends AlwaysAskable>(
  pool: T[],
  count?: number
): T[] {
  const n = count ?? pickQuestionCount(pool.length);
  if (pool.length === 0 || n <= 0) return [];

  const mandatory = pool.filter((q) => q.alwaysAsk);
  const optional = pool.filter((q) => !q.alwaysAsk);
  const shuffledOptional = [...optional].sort(() => Math.random() - 0.5);

  const remaining = Math.max(0, n - mandatory.length);
  const picked = [...mandatory, ...shuffledOptional.slice(0, remaining)];

  // Light shuffle so the mandatory question isn't always first in the UI.
  return picked.sort(() => Math.random() - 0.5);
}
