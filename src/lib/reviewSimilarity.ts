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

const PHRASE_STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "is", "was", "are", "were", "it", "its", "it's",
  "i", "we", "my", "our", "of", "to", "in", "on", "at", "for", "with", "this", "that",
  "they", "their", "here", "there", "so", "very", "quite", "also", "be", "been",
]);

/** Three-word phrases repeated across at least two recent drafts, most common first. */
export function overusedPhrases(recentDrafts: string[], max = 12): string[] {
  const counts = new Map<string, number>();
  for (const draft of recentDrafts) {
    const words = normalizeForCompare(draft).split(" ").filter(Boolean);
    const seen = new Set<string>();
    for (let i = 0; i + 3 <= words.length; i++) {
      const gram = words.slice(i, i + 3);
      if (gram.every((w) => PHRASE_STOPWORDS.has(w))) continue;
      seen.add(gram.join(" "));
    }
    for (const phrase of seen) counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
  }
  const ranked = [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([phrase]) => phrase.split(" "));

  // Chain overlapping trigrams ("the ambience of" + "ambience of this") into one phrase.
  const merged: string[][] = [];
  for (const gram of ranked) {
    const head = gram.slice(0, 2).join(" ");
    const tail = gram.slice(1).join(" ");
    const extendable = merged.find((p) => p.slice(-2).join(" ") === head);
    if (extendable) {
      extendable.push(gram[2]);
      continue;
    }
    const prependable = merged.find((p) => p.slice(0, 2).join(" ") === tail);
    if (prependable) {
      prependable.unshift(gram[0]);
      continue;
    }
    merged.push([...gram]);
  }
  return merged.slice(0, max).map((p) => p.join(" "));
}

export function truncateDraft(text: string, max = 280): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max) + "…";
}
