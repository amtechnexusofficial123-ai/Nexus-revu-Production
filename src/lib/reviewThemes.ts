export const MIN_REVIEW_THEMES = 3;
export const MAX_REVIEW_THEMES = 5;

/** Parse newline- or comma-separated theme lines into a clean list. */
export function parseReviewThemes(input: string | string[] | null | undefined): string[] {
  if (Array.isArray(input)) {
    return input.map((t) => t.trim()).filter(Boolean).slice(0, MAX_REVIEW_THEMES);
  }
  if (!input?.trim()) return [];
  return input
    .split(/\n|,/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, MAX_REVIEW_THEMES);
}

export function validateReviewThemes(themes: string[]): string | null {
  if (themes.length < MIN_REVIEW_THEMES) {
    return `Add at least ${MIN_REVIEW_THEMES} review themes (one per line)`;
  }
  if (themes.length > MAX_REVIEW_THEMES) {
    return `Use at most ${MAX_REVIEW_THEMES} review themes`;
  }
  return null;
}

export function pickHighlightTheme(themes: string[]): string | undefined {
  if (themes.length === 0) return undefined;
  return themes[Math.floor(Math.random() * themes.length)];
}

export function themesToText(themes: string[] | null | undefined): string {
  return (themes ?? []).join("\n");
}
