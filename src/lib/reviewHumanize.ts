/**
 * Cleans model output so reviews read like a person typed them, not marketing copy.
 */
export function humanizeReview(text: string): string {
  let s = text.trim();

  // Em / en dashes → comma
  s = s.replace(/\s*[—–]\s*/g, ", ");
  // Spaced hyphens used as dashes → comma
  s = s.replace(/\s+-\s+/g, ", ");
  // Hyphenated compounds → spaced words
  s = s.replace(/\b([a-zA-Z]+)-([a-zA-Z]+)\b/g, "$1 $2");
  // Collapse repeated punctuation
  s = s.replace(/([.!?,])\1+/g, "$1");
  s = s.replace(/\s{2,}/g, " ");
  s = s.replace(/\s+([,.!?])/g, "$1");

  return s.trim();
}
