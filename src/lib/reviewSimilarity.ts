/** Normalize for comparison: lowercase, strip most punctuation. */
export function normalizeForCompare(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function firstSentence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^[^.!?]+[.!?]?/);
  return match ? match[0].trim() : trimmed;
}

/** Words longer than 2 chars for overlap checks. */
export function contentWords(text: string): string[] {
  return normalizeForCompare(text)
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function firstNContentWords(text: string, n: number): string {
  return contentWords(text).slice(0, n).join(" ");
}

function jaccardSimilarity(a: string, b: string): number {
  const wordsA = new Set(contentWords(a));
  const wordsB = new Set(contentWords(b));
  if (wordsA.size === 0 && wordsB.size === 0) return 0;

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  const union = wordsA.size + wordsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** True when the draft is too close to any recent draft at this business. */
export function draftTooSimilar(draft: string, recentDrafts: string[]): boolean {
  const candidate = draft.trim();
  if (!candidate) return false;

  for (const recent of recentDrafts) {
    if (!recent?.trim()) continue;
    const prior = recent.trim();

    const candOpen = firstNContentWords(candidate, 8);
    const priorOpen = firstNContentWords(prior, 8);
    if (candOpen && candOpen === priorOpen) return true;

    const candFirst = normalizeForCompare(firstSentence(candidate));
    const priorFirst = normalizeForCompare(firstSentence(prior));
    if (candFirst && candFirst === priorFirst) return true;

    if (jaccardSimilarity(candidate, prior) >= 0.72) return true;
  }

  return false;
}

export function recentOpenings(recentDrafts: string[]): string[] {
  return recentDrafts.map((d) => firstSentence(d)).filter(Boolean);
}

export function truncateDraft(text: string, max = 280): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max) + "…";
}
