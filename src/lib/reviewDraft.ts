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
      draftText: `Had a great time at ${businessName}. ${middle}. Would definitely come back.`,
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

function estimateSentiment(qas: QA[]): DraftResult["sentiment"] {
  const ratings = qas
    .map((qa) => {
      const m = qa.answer.match(/^(\d)\s+out of 5 stars$/i);
      return m ? Number(m[1]) : null;
    })
    .filter((n): n is number => n !== null);

  if (ratings.length === 0) return "neutral";

  const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  if (avg >= 4) return "positive";
  if (avg <= 2) return "negative";
  return "neutral";
}

/** How many questions to show: all if ≤3 in pool, otherwise always 3 random. */
export function pickQuestionCount(poolSize: number): number {
  if (poolSize <= 3) return poolSize;
  return 3;
}

/** Picks random questions out of the business's active question pool. */
export function pickRandomQuestions<T>(pool: T[], count?: number): T[] {
  const n = count ?? pickQuestionCount(pool.length);
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(n, shuffled.length));
}
