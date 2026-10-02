/**
 * Cleans model output so reviews read like a person typed them, not marketing copy.
 * Light "mess" only — never parody typos or stacked slang.
 */
/** ~40% start lowercase for a casual note feel. */
const CASUAL_LOWER_FIRST_CHANCE = 0.4;
/** ~40% drop the trailing period. */
const DROP_FINAL_PERIOD_CHANCE = 0.4;
/** Soften AI-perfect commas. */
const DROP_ONE_COMMA_CHANCE = 0.25;
/** Soften enthusiastic ! that models overuse. */
const SOFTEN_EXCLAIM_CHANCE = 0.35;

/** Stripped post-generation if the model slips marketing / corporate language through. Longest first. */
const MARKETING_PHRASES = [
  "will definitely be visiting again",
  "will be visiting again",
  "would definitely come back",
  "would definitely be back",
  "will definitely come back",
  "will definitely be back",
  "would love to come back",
  "looking forward to coming back",
  "looking forward to visiting again",
  "can't wait to come back",
  "can't wait to go back",
  "cant wait to go back",
  "will be back soon",
  "we'll be back",
  "we will be back",
  "i'll be back",
  "i will be back",
  "see you soon",
  "until next time",
  "highly recommended",
  "highly recommend",
  "amazing experience",
  "exceptional service",
  "perfect experience",
  "overall experience",
  "went above and beyond",
  "above and beyond",
  "you won't be disappointed",
  "exceeded expectations",
  "cannot say enough",
  "can't say enough",
  "gem of a place",
  "don't hesitate",
  "hidden gem",
  "must visit",
  "must try",
  "must-try",
  "top notch",
  "top-notch",
  "five stars",
  "second to none",
  "absolutely loved",
  "truly wonderful",
  "hands down",
  "atmosphere was",
  "exceptional",
  "delightful",
] as const;

/** American → Indian/British spelling and everyday words. Whole-word, case preserved. */
const INDIAN_ENGLISH_SWAPS: Record<string, string> = {
  color: "colour",
  colors: "colours",
  colorful: "colourful",
  flavor: "flavour",
  flavors: "flavours",
  flavorful: "flavourful",
  flavored: "flavoured",
  favorite: "favourite",
  favorites: "favourites",
  behavior: "behaviour",
  neighborhood: "neighbourhood",
  savory: "savoury",
  organized: "organised",
  realized: "realised",
  apologized: "apologised",
  customized: "customised",
  recognized: "recognised",
  restroom: "washroom",
  restrooms: "washrooms",
  takeout: "takeaway",
  elevator: "lift",
  "cell phone": "mobile",
  gotten: "got",
  awesome: "superb",
};

function matchCase(source: string, replacement: string): string {
  if (source === source.toUpperCase() && source.length > 1) return replacement.toUpperCase();
  if (source[0] === source[0].toUpperCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function applyIndianEnglishSwaps(text: string): string {
  let s = text;
  for (const [from, to] of Object.entries(INDIAN_ENGLISH_SWAPS)) {
    s = s.replace(new RegExp(`\\b${escapeRegExp(from)}\\b`, "gi"), (m) => matchCase(m, to));
  }
  return s;
}

/**
 * Invented visit context (meal, time of day, companions). Each group is stripped
 * only when the customer's answers don't mention that kind of thing.
 */
const VISIT_CONTEXT_GROUPS: { mentioned: RegExp; strip: RegExp[] }[] = [
  {
    mentioned: /\b(breakfast|brunch|lunch|dinner|supper)\b/i,
    strip: [
      /,?\s*\b(?:for|over|at|during)\s+(?:a\s+|an\s+|our\s+|my\s+)?(?:quick\s+|late\s+|early\s+|family\s+|weekend\s+)?(?:breakfast|brunch|lunch|dinner|supper)\b/gi,
    ],
  },
  {
    mentioned: /\b(morning|afternoon|evening|night|tonight|yesterday|weekend|sunday|saturday|friday)\b/i,
    strip: [
      /,?\s*\b(?:last|this|one|on\s+a|on\s+the|in\s+the)\s+(?:night|evening|morning|afternoon|weekend|sunday|saturday|friday)\b/gi,
      /,?\s*\bover\s+the\s+weekend\b/gi,
      /,?\s*\b(?:tonight|yesterday)\b/gi,
    ],
  },
  {
    mentioned: /\b(wife|husband|family|friends?|kids|children|parents|girlfriend|boyfriend|partner|colleagues?|date|fiance|fiancee|cousins?)\b/i,
    strip: [
      /,?\s*\b(?:along\s+with|with)\s+(?:my\s+|our\s+|a\s+|some\s+)?(?:whole\s+|entire\s+|close\s+)?(?:wife|husband|family|friends?|kids|children|parents|mom|mum|dad|girlfriend|boyfriend|partner|colleagues?|fiance|fiancee|cousins?|date)\b/gi,
      /,?\s*\bon\s+a\s+date(?:\s+night)?\b/gi,
    ],
  },
];

function stripUnmentionedVisitContext(text: string, answersText: string): string {
  let s = text;
  for (const group of VISIT_CONTEXT_GROUPS) {
    if (group.mentioned.test(answersText)) continue;
    for (const pattern of group.strip) s = s.replace(pattern, "");
  }
  // A phrase removed from the start of a sentence can leave a dangling comma.
  return s.replace(/^[\s,]+/, "").replace(/([.!?]\s+),\s*/g, "$1");
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripMarketingPhrases(text: string): string {
  let s = text;
  for (const phrase of MARKETING_PHRASES) {
    s = s.replace(new RegExp(`\\b${escapeRegExp(phrase)}\\b`, "gi"), "");
  }
  // Strip leftover corporate return closers that slipped past exact phrases.
  s = s.replace(
    /(?:^|[.!?]\s*)(?:i|we)(?:'d| would| will|'ll)?\s+(?:definitely\s+)?(?:be\s+)?(?:coming|going|visiting)\s+back(?:\s+again)?[.!]?\s*$/gi,
    ""
  );
  s = s.replace(
    /(?:^|[.!?]\s*)(?:looking\s+forward\s+to\s+(?:coming|visiting)\s+again)[.!]?\s*$/gi,
    ""
  );
  return s;
}

function normalizePunctuationSpacing(text: string): string {
  return text
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/([,.!?])\s*([,.!?])+/g, "$1")
    .replace(/,{2,}/g, ",")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+$/g, "")
    .trim();
}

function maybeLowercaseFirstWord(text: string): string {
  if (Math.random() >= CASUAL_LOWER_FIRST_CHANCE) return text;

  const match = text.match(/^([A-Za-z]+)/);
  if (!match) return text;

  const word = match[1];
  if (word === "I" || word.length <= 1) return text;
  if (word === word.toUpperCase() && word.length > 1) return text;

  const first = word[0];
  if (first === first.toLowerCase()) return text;

  return text.replace(/^([A-Za-z])/, (c) => c.toLowerCase());
}

function maybeDropFinalPeriod(text: string): string {
  if (Math.random() >= DROP_FINAL_PERIOD_CHANCE) return text;
  if (!text.endsWith(".")) return text;
  if (text.endsWith("...")) return text;
  return text.slice(0, -1);
}

/** Drop one mid-sentence comma so rhythm feels less polished. */
function maybeDropOneComma(text: string): string {
  if (Math.random() >= DROP_ONE_COMMA_CHANCE) return text;
  const matches = [...text.matchAll(/, /g)];
  if (matches.length === 0) return text;
  const pick = matches[Math.floor(Math.random() * matches.length)];
  if (pick.index == null) return text;
  return text.slice(0, pick.index) + " " + text.slice(pick.index + 2);
}

function maybeSoftenExclaim(text: string): string {
  if (Math.random() >= SOFTEN_EXCLAIM_CHANCE) return text;
  if (!text.includes("!")) return text;
  const last = text.lastIndexOf("!");
  if (last < 0) return text;
  const replacement = Math.random() < 0.5 ? "." : "";
  return text.slice(0, last) + replacement + text.slice(last + 1);
}

/** `answersText` is the customer's Q&A; visit context they mentioned is kept. */
export function humanizeReview(text: string, answersText = ""): string {
  let s = text.trim();

  // Em / en dashes → comma
  s = s.replace(/\s*[—–]\s*/g, ", ");
  // Spaced hyphens used as dashes → comma
  s = s.replace(/\s+-\s+/g, ", ");
  // Hyphenated compounds → spaced words
  s = s.replace(/\b([a-zA-Z]+)-([a-zA-Z]+)\b/g, "$1 $2");
  // Collapse repeated punctuation
  s = s.replace(/([.!?,])\1+/g, "$1");

  s = stripMarketingPhrases(s);
  s = stripUnmentionedVisitContext(s, answersText);
  s = applyIndianEnglishSwaps(s);
  s = normalizePunctuationSpacing(s);

  s = maybeDropOneComma(s);
  s = maybeSoftenExclaim(s);
  s = maybeLowercaseFirstWord(s);
  s = maybeDropFinalPeriod(s);

  return normalizePunctuationSpacing(s).trim();
}
