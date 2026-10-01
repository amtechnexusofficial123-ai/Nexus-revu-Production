import { needsOptions, type QuestionType } from "@/lib/questionTypes";

export const MAX_QUESTIONS = 10;
export const VALID_TYPES: QuestionType[] = ["text", "rating", "multiple_choice", "dropdown"];

export type IncomingQuestion = {
  text: string;
  type: QuestionType;
  options?: string[] | null;
  active?: boolean;
  alwaysAsk?: boolean;
};

/** Validates a full question set for save. Returns an error message or null. */
export function validateQuestionSet(incoming: IncomingQuestion[]): string | null {
  if (!Array.isArray(incoming)) return "questions must be an array";
  if (incoming.length > MAX_QUESTIONS) {
    return `You can only have up to ${MAX_QUESTIONS} questions`;
  }

  let alwaysAskCount = 0;
  for (const q of incoming) {
    if (!q.text?.trim()) return "Every question needs text";
    if (!VALID_TYPES.includes(q.type)) return `Invalid question type: ${q.type}`;
    if (needsOptions(q.type) && (!q.options || q.options.filter((o) => o?.trim()).length < 2)) {
      return `"${q.text}" needs at least 2 options`;
    }
    if (q.alwaysAsk) {
      alwaysAskCount++;
      if (q.active === false) {
        return `"${q.text}" is marked always ask but is turned off — enable it or unmark it`;
      }
    }
  }
  if (alwaysAskCount > 1) {
    return "Only one question can be marked as always ask";
  }
  return null;
}

export function normalizeQuestionsForInsert(
  businessId: string,
  incoming: IncomingQuestion[]
) {
  // Enforce a single always-ask flag even if the client sent more than one.
  let alwaysAskAssigned = false;
  return incoming.map((q, i) => {
    const wantsAlwaysAsk = Boolean(q.alwaysAsk) && (q.active ?? true);
    const alwaysAsk = wantsAlwaysAsk && !alwaysAskAssigned;
    if (alwaysAsk) alwaysAskAssigned = true;
    return {
      businessId,
      text: q.text.trim(),
      type: q.type,
      options: needsOptions(q.type) ? q.options!.map((o) => o.trim()).filter(Boolean) : null,
      position: i,
      active: q.active ?? true,
      alwaysAsk,
    };
  });
}
