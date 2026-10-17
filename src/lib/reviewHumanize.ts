/**
 * Cleans model output so reviews read like a person typed them, not marketing copy.
 * Light "mess" only — never parody typos or stacked slang.
 */
/** ~15% start lowercase for a casual note feel. */
const CASUAL_LOWER_FIRST_CHANCE = 0.15;
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
  "you won't be disappointed",
  "cannot say enough",
  "can't say enough",
  "don't hesitate",
  "hands down",
] as const;

/** A list means one option is picked at random per match, so drafts don't converge on one word. */
type Swaps = Record<string, string | readonly string[]>;

/**
 * Clichés that sit mid-sentence, so deleting them would leave a broken sentence.
 * Swapped for plain wording instead. Longest first.
 */
const CLICHE_SWAPS: Swaps = {
  "went above and beyond": ["went out of their way", "really took care of me", "were very helpful"],
  "exceptional service": ["very good service", "really good service", "excellent service"],
  "exceeded expectations": ["was better than expected", "was more than I expected"],
  "amazing experience": ["good experience", "nice experience", "really good experience"],
  "perfect experience": ["good experience", "nice experience", "really good experience"],
  "absolutely loved": ["really liked", "loved", "enjoyed"],
  "truly wonderful": ["very nice", "really nice", "lovely"],
  "second to none": ["very good", "really good"],
  "gem of a place": ["nice place", "good place"],
  "hidden gem": ["nice find", "good find"],
  "top notch": ["very good", "excellent", "first class"],
  "five stars": "full marks",
  exceptional: ["very good", "excellent", "really good"],
  delightful: ["very nice", "lovely", "really nice"],
};

/** American → Indian/British spelling and everyday words. Whole-word, case preserved. */
const INDIAN_ENGLISH_SWAPS: Swaps = {
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
  awesome: ["superb", "excellent", "very nice"],
};

/**
 * British understatement in positive drafts ("ambience is fine") reads lukewarm.
 * Only applied to positive drafts — neutral/negative "fine" is meant literally. Longest first.
 */
const POSITIVE_UNDERSTATEMENT_SWAPS: Swaps = {
  "not bad at all": ["really good", "very good"],
  "decent enough": ["good", "nice"],
  "pretty decent": ["good", "nice"],
  "quite decent": ["quite good", "quite nice"],
  "quite fine": ["quite good", "quite nice"],
  "turned out fine": ["turned out good", "turned out nice"],
  "rather good": ["very good", "really good"],
  "is fine": ["is nice", "is good"],
  "was fine": ["was nice", "was good"],
  "are fine": ["are nice", "are good"],
  "were fine": ["were nice", "were good"],
  "looks fine": ["looks nice", "looks good"],
  "felt fine": ["felt nice", "felt good"],
  decent: ["good", "nice"],
};

function matchCase(source: string, replacement: string): string {
  if (source === source.toUpperCase() && source.length > 1) return replacement.toUpperCase();
  if (source[0] === source[0].toUpperCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function applySwaps(text: string, swaps: Swaps): string {
  let s = text;
  for (const [from, to] of Object.entries(swaps)) {
    s = s.replace(new RegExp(`\\b${escapeRegExp(from)}\\b`, "gi"), (m) => {
      const pick = typeof to === "string" ? to : to[Math.floor(Math.random() * to.length)];
      return matchCase(m, pick);
    });
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

/** Filler topics the model invents; a sentence on one is dropped unless the Q&A raises it. */
const UNPROMPTED_TOPICS: RegExp[] = [
  /\b(washrooms?|restrooms?|toilets?|bathrooms?|loo)\b/i,
  /\bparking\b/i,
];

const IMPROVEMENT_DEMAND =
  /\b(?:management|owners?|they|staff)\s+(?:must|should|needs? to|has to|have to)\b|\bplease\s+(?:improve|maintain|fix|look into)\b|\bneeds?\s+(?:improvement|to be improved)\b|\bcould (?:be|do) (?:a bit )?better\b|\bscope for improvement\b|\bonly (?:complaint|issue|downside|problem)\b/i;

const ANSWER_COMPLAINT =
  /\b(not|no|never|bad|poor|slow|late|cold|dirty|rude|costly|expensive|overpriced|average|okay|ok|improve|issue|problem|complain\w*|disappoint\w*|wait(?:ed|ing)?)\b/i;
const LOW_RATING = /^\s*[1-3](?:\s*\/\s*5|\s*stars?)?\s*$/i;

function answersHaveComplaint(answers: string[]): boolean {
  return answers.some((a) => LOW_RATING.test(a) || ANSWER_COMPLAINT.test(a));
}

function dropInventedSentences(
  text: string,
  answersText: string,
  sentiment: string | undefined,
  answers: string[]
): string {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const dropDemands = sentiment === "positive" && !answersHaveComplaint(answers);
  const kept = sentences.filter((sentence) => {
    if (UNPROMPTED_TOPICS.some((t) => t.test(sentence) && !t.test(answersText))) return false;
    if (dropDemands && IMPROVEMENT_DEMAND.test(sentence)) return false;
    return true;
  });
  return kept.length > 0 ? kept.join(" ") : text;
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

/** The model sometimes lowercases on its own; start from consistent capitals. */
function capitaliseSentenceStarts(text: string): string {
  return text.replace(/(^|[.!?]\s+)([a-z])/g, (_, lead: string, ch: string) => lead + ch.toUpperCase());
}

/**
 * Lowercase every sentence start (not just the first) so casing stays consistent.
 * Skips "I", all-caps words, and likely multi-word names ("Baskin Robbins").
 */
function maybeLowercaseSentenceStarts(text: string): string {
  if (Math.random() >= CASUAL_LOWER_FIRST_CHANCE) return text;

  return text.replace(
    /(^|[.!?]\s+)([A-Z][A-Za-z']*)(\s+[A-Za-z]+)?/g,
    (full, lead: string, word: string, next: string | undefined) => {
      if (word === "I" || /^I'/.test(word)) return full;
      if (word.length > 1 && word === word.toUpperCase()) return full;
      if (next && /^\s+[A-Z]/.test(next)) return full;
      return lead + word[0].toLowerCase() + word.slice(1) + (next ?? "");
    }
  );
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

/**
 * `answersText` is the customer's Q&A; visit context they mentioned is kept.
 * `sentiment` enables understatement swaps for positive drafts.
 * `answers` (answer values only) decide whether improvement demands are genuine.
 */
export function humanizeReview(
  text: string,
  answersText = "",
  sentiment?: string,
  answers: string[] = []
): string {
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
  s = dropInventedSentences(s, answersText, sentiment, answers);
  s = applySwaps(s, CLICHE_SWAPS);
  s = applySwaps(s, INDIAN_ENGLISH_SWAPS);
  if (sentiment === "positive") s = applySwaps(s, POSITIVE_UNDERSTATEMENT_SWAPS);
  s = normalizePunctuationSpacing(s);

  s = maybeDropOneComma(s);
  s = maybeSoftenExclaim(s);
  s = capitaliseSentenceStarts(s);
  s = maybeLowercaseSentenceStarts(s);
  s = maybeDropFinalPeriod(s);

  return normalizePunctuationSpacing(s).trim();
}
