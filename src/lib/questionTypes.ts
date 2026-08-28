export type QuestionType = "text" | "rating" | "multiple_choice" | "dropdown";

export const QUESTION_TYPES: { id: QuestionType; label: string; hint: string }[] = [
  { id: "text", label: "Open text", hint: "Customer types their own answer" },
  { id: "rating", label: "Star rating", hint: "1 to 5 stars" },
  { id: "multiple_choice", label: "Multiple choice", hint: "Pick one option" },
  { id: "dropdown", label: "Dropdown", hint: "Pick one from a dropdown list" },
];

export function needsOptions(type: QuestionType): boolean {
  return type === "multiple_choice" || type === "dropdown";
}

/**
 * Turns a raw answer value into a readable string for the review draft
 * and for display. Ratings come in as numbers (1-5); everything else is
 * already a string.
 */
export function formatAnswerForDisplay(type: QuestionType, value: string | number): string {
  if (type === "rating") {
    const n = Number(value);
    if (!n || n < 1 || n > 5) return "";
    return `${n} out of 5 stars`;
  }
  return String(value);
}
