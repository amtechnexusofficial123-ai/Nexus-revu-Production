export type QA = { question: string; answer: string };

export type LengthMode = "single" | "two_liner" | "medium";

/** Length bands baked into the first Gemini prompt (no re-roll). */
export type LengthBand = {
  minWords: number;
  maxWords: number;
  /** Sentence range — lite models follow sentence counts far better than word counts. */
  minSentences: number;
  maxSentences: number;
};

export const LENGTH_BANDS: Record<LengthMode, LengthBand> = {
  single: { minWords: 8, maxWords: 18, minSentences: 1, maxSentences: 1 },
  two_liner: { minWords: 14, maxWords: 32, minSentences: 2, maxSentences: 2 },
  medium: { minWords: 40, maxWords: 70, minSentences: 3, maxSentences: 5 },
};

/** Aim points inside each hard band (never outside). */
export const TARGET_LENGTHS = [45, 52, 58, 65] as const;
export const SINGLE_SENTENCE_TARGET_LENGTHS = [10, 12, 14, 16] as const;
export const TWO_LINER_TARGET_LENGTHS = [18, 22, 26, 30] as const;

/** Non-formula shapes for medium drafts — never opening + service + closing.
 *  No example openers in the text — models copy those into every draft. */
export const STRUCTURE_SEEDS = [
  "Start mid-thought, no stock opener, then add two or three more details",
  "Jump straight into what stood out, then cover a second and third detail",
  "Sound like telling a friend about the visit, a few relaxed sentences",
  "State the main point first, then explain why in a couple of sentences",
  "Short fragment first, then a few plain sentences with specifics",
  "Go through what you tried, how it was, and one small extra observation",
] as const;

/** How the first sentence starts. No example openers — models copy those verbatim. */
export const OPENING_STYLES = [
  "Open with your verdict in a few words",
  "Open with the specific item or thing you are talking about",
  "Open with a small moment or detail you noticed",
  "Open with a quick reaction, then the detail behind it",
  "Open with a short fragment, not a full sentence",
  "Open by comparing it to what you expected",
] as const;

/** Sharply different voices so drafts don't all blend into the same casual tone. */
export type VoiceProfile = {
  id: "blunt" | "warm" | "practical" | "chatty" | "choppy";
  label: string;
  dos: readonly [string, string, string];
  donts: readonly [string, string, string];
};

export const VOICE_PROFILES: readonly VoiceProfile[] = [
  {
    id: "blunt",
    label: "Blunt / matter-of-fact",
    dos: [
      "Plain statements only",
      "Say what happened with almost no softener",
      "Sound decisive — like stating a fact",
    ],
    donts: [
      "No warm praise words (lovely, wonderful, so nice)",
      "No chatty asides or filler",
      "No soft hedging (kinda, maybe, I guess)",
    ],
  },
  {
    id: "warm",
    label: "Warm / friendly",
    dos: [
      "Sound like you're glad you went — still natural",
      "A touch of friendliness toward staff or the place",
      "Use soft positive everyday words (nice, good, happy)",
    ],
    donts: [
      "No cold blunt clipped tone",
      "No dry sarcasm",
      "No corporate thank-you / delighted language",
    ],
  },
  {
    id: "practical",
    label: "Practical / no-nonsense",
    dos: [
      "Focus on practical points like taste, price, quantity, speed or cleanliness",
      "Simple everyday words ('good', 'nice', 'quick', 'reasonable')",
      "Give a clear verdict on each point",
    ],
    donts: [
      "No British understatement ('quite fine', 'decent enough', 'not bad at all')",
      "No gushing or stacked exclamation marks",
      "No sarcasm or dry wit",
    ],
  },
  {
    id: "chatty",
    label: "Chatty / slightly talkative",
    dos: [
      "A bit more running commentary, like telling a friend",
      "Contractions and spoken rhythm",
      "Can add a small aside in the middle",
    ],
    donts: [
      "Don't go silent/clipped like a telegram",
      "Don't sound like a brochure",
      "Don't stack formal sentences",
    ],
  },
  {
    id: "choppy",
    label: "Choppy / phone-note",
    dos: [
      "Broken rhythm — fragments ok",
      "Short punchy beats, several of them",
      "Feels typed in a hurry",
    ],
    donts: [
      "No smooth flowing paragraph",
      "No polished full sentences if a fragment works",
      "No essay-like connectors (furthermore, overall, also)",
    ],
  },
] as const;

/** @deprecated Use VOICE_PROFILES — kept for any old imports. */
export const VOICE_SEEDS = VOICE_PROFILES.map((v) => v.label);

/** Natural Indian English patterns; 3 are drawn per draft so drafts don't all share the same phrases. */
export const INDIAN_ENGLISH_TOUCHES = [
  'Use "quite" or "very" as everyday intensifiers ("quite good", "very slow", "very cooperative")',
  'Treat staff as singular ("staff was polite", "staff was very cooperative")',
  'If price comes up, say "value for money", "reasonable rates", "bit costly" or "on the higher side"',
  'Say "ambience" instead of "atmosphere" or "vibe"',
  'Only if the answers mention cleanliness, say "neat and clean"',
  'Place "also" Indian style ("prices are also reasonable", "staff was also helpful")',
  'Address the business once directly: "keep it up" if the answers are positive, or ask them to fix the exact complaint the answers raise',
  'Use "superb" or "too good" for praise, or "not up to the mark" for criticism',
  'Drop the "a" before "bit" once ("bit crowded", "bit costly")',
  'Describe service as "prompt", "quick" or "slow" ("service was prompt")',
  'Use "had" for eating or trying something ("had their cold coffee"), only for items in the answers',
  'If the answers are positive, recommend lightly with "do try" or "can go for it"',
  'Use one common Indian review phrase: "value for money", "very nice", or if positive "must try" or "highly recommended"',
] as const;

export const CONTENT_FOCUS_SEEDS = [
  "Focus on one product or thing they tried",
  "Focus on first impression walking in",
  "Focus on staff or how they were treated",
  "Focus on quality or value",
  "Focus on atmosphere or vibe",
  "Focus on one concrete detail from context — nothing else",
] as const;

export type VariationBundle = {
  targetWords: number;
  structureSeed: string;
  voice: VoiceProfile;
  /** Label only — prefer `voice` for rules. */
  voiceSeed: string;
  leadQa: QA;
  openingStyle: string;
  /** All answers in a shuffled order, so the model doesn't always walk them top to bottom. */
  answerOrder?: QA[];
  /** Subset to centre this draft on; empty when every answer is featured. */
  featuredQas?: QA[];
  contentFocusSeed?: string;
  highlightTheme?: string;
  singleSentence: boolean;
  lengthMode: LengthMode;
  indianTouches: string[];
};

const SINGLE_STRUCTURE = "One casual sentence only — stop there, no wrap-up";
const TWO_LINER_STRUCTURE =
  "Two short lines that feel a bit disjointed, like a phone note";

/** ~20% two-liner, ~80% medium. Single-sentence drafts are no longer picked. */
function pickLengthMode(): LengthMode {
  return Math.random() < 0.2 ? "two_liner" : "medium";
}

function pickTargetWords(mode: LengthMode): number {
  if (mode === "single") return pickRandom(SINGLE_SENTENCE_TARGET_LENGTHS);
  if (mode === "two_liner") return pickRandom(TWO_LINER_TARGET_LENGTHS);
  return pickRandom(TARGET_LENGTHS);
}

function pickStructureSeed(mode: LengthMode): string {
  if (mode === "single") return SINGLE_STRUCTURE;
  if (mode === "two_liner") return TWO_LINER_STRUCTURE;
  return pickRandom(STRUCTURE_SEEDS);
}

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function pickVoice(): VoiceProfile {
  return pickRandom(VOICE_PROFILES);
}

function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pickIndianTouches(count = 3): string[] {
  return shuffle(INDIAN_ENGLISH_TOUCHES).slice(0, count);
}

/** Hard Indian English block — placed at the top of prompts so lite models weight it. */
export function formatIndianEnglishRules(touches: string[], lengthMode: LengthMode): string {
  const minTouches = lengthMode === "medium" ? "at least TWO" : "at least ONE";
  return `HARD RULE — INDIAN ENGLISH (most important style rule):
- Write the way an Indian customer actually types a Google review, NOT American or British review English
- British/Indian spelling (flavour, colour, favourite, centre, organised)
- Indian everyday words when the answers already touch that topic: takeaway (not takeout), bill (not check)
- No American slang or hype ("awesome", "super cute", "stoked", "y'all", "gotten")
- No British understatement ("quite fine", "decent enough", "rather good", "not bad at all") — say plainly whether it was good or not
- Common Indian review phrases ("value for money", "very nice", "must try", "highly recommended") are fine, at most one per review
- Plain simple sentences; contractions optional
- Natural, not a parody: no Hindi words, no fake accent, no deliberate typos or broken grammar
Use ${minTouches} of these Indian English touches for THIS draft, worked in naturally (skip any touch whose topic is not in the answers):
${touches.map((t) => `- ${t}`).join("\n")}`;
}

/** Hard voice block for prompts — must be obvious in the output. */
export function formatVoiceHardRules(voice: VoiceProfile): string {
  return `HARD RULE — VOICE FOR THIS DRAFT (must be obvious to a reader):
Voice: ${voice.label}
MUST do:
${voice.dos.map((d) => `- ${d}`).join("\n")}
MUST NOT:
${voice.donts.map((d) => `- ${d}`).join("\n")}
If this draft could pass for a different voice, rewrite until THIS voice is clear.`;
}

function buildBundle(
  leadQa: QA,
  extras?: Partial<
    Pick<VariationBundle, "contentFocusSeed" | "highlightTheme" | "answerOrder" | "featuredQas">
  > & {
    lengthMode?: LengthMode;
  }
): VariationBundle {
  const lengthMode = extras?.lengthMode ?? pickLengthMode();
  const voice = pickVoice();
  return {
    targetWords: pickTargetWords(lengthMode),
    structureSeed: pickStructureSeed(lengthMode),
    voice,
    voiceSeed: voice.label,
    leadQa,
    openingStyle: pickRandom(OPENING_STYLES),
    answerOrder: extras?.answerOrder,
    featuredQas: extras?.featuredQas,
    singleSentence: lengthMode === "single",
    lengthMode,
    contentFocusSeed:
      lengthMode === "medium" ? extras?.contentFocusSeed : undefined,
    highlightTheme: extras?.highlightTheme,
    indianTouches: pickIndianTouches(),
  };
}

/** Prompt block: hard min/max (and shape) for this length mode. */
export function formatLengthHardRule(
  mode: LengthMode,
  targetWords: number
): string {
  const band = LENGTH_BANDS[mode];
  if (mode === "single") {
    return `HARD RULE — LENGTH (must follow on the first try):
- Write exactly ONE casual sentence — no second sentence, no wrap-up
- Word count MUST be between ${band.minWords} and ${band.maxWords} (aim ~${targetWords})
- Do not write a paragraph`;
  }
  if (mode === "two_liner") {
    return `HARD RULE — LENGTH (must follow on the first try):
- Write exactly TWO sentences (or two lines), a bit disjointed
- Word count MUST be between ${band.minWords} and ${band.maxWords} total (aim ~${targetWords})
- Not a polished single paragraph`;
  }
  return `HARD RULE — LENGTH (must follow on the first try):
- Write ${band.minSentences} to ${band.maxSentences} sentences — fewer than ${band.minSentences} is a failure
- Total word count MUST be between ${band.minWords} and ${band.maxWords} (aim ~${targetWords})
- Each sentence adds something different (a detail, a reaction, a small observation) — no filler or repetition
- Uneven, natural shape — not a neat essay, but do not stop after one or two sentences`;
}

export function pickVariation(qas: QA[]): VariationBundle {
  const answerOrder = shuffle(qas.filter((qa) => qa.answer.trim()));
  if (answerOrder.length === 0) {
    return buildBundle({ question: "overall experience", answer: "positive visit" });
  }
  const lengthMode = pickLengthMode();
  const featureCount = lengthMode === "medium" ? 2 + Math.floor(Math.random() * 2) : 2;
  // Bare ratings ("5/5") give the model nothing concrete to open with, so they go last.
  const byContent = [
    ...answerOrder.filter((qa) => !isBareRating(qa.answer)),
    ...answerOrder.filter((qa) => isBareRating(qa.answer)),
  ];
  const featured = byContent.slice(0, featureCount);
  return buildBundle(featured[0], {
    lengthMode,
    answerOrder,
    featuredQas: featured.length < answerOrder.length ? featured : [],
  });
}

export function pickVariationRetry(qas: QA[], previous: VariationBundle): VariationBundle {
  const prevKey = qaKey(previous.leadQa);
  let next = pickVariation(qas);
  let attempts = 0;
  while (
    attempts < 12 &&
    next.lengthMode === previous.lengthMode &&
    next.structureSeed === previous.structureSeed &&
    next.voice.id === previous.voice.id &&
    next.openingStyle === previous.openingStyle &&
    qaKey(next.leadQa) === prevKey
  ) {
    next = pickVariation(qas);
    attempts++;
  }
  return next;
}

function isBareRating(answer: string): boolean {
  return /^\s*\d+(?:\.\d+)?\s*(?:\/\s*\d+|stars?)?\s*$/i.test(answer);
}

function qaKey(qa: QA): string {
  return `${qa.question}|||${qa.answer}`;
}

export function pickNoAnswerVariation(reviewThemes: string[]): VariationBundle {
  return buildBundle(
    { question: "overall experience", answer: "positive visit" },
    {
      contentFocusSeed: pickRandom(CONTENT_FOCUS_SEEDS),
      highlightTheme: pickRandomTheme(reviewThemes),
    }
  );
}

export function pickNoAnswerVariationRetry(
  reviewThemes: string[],
  previous: VariationBundle
): VariationBundle {
  let next = pickNoAnswerVariation(reviewThemes);
  let attempts = 0;
  while (
    attempts < 12 &&
    next.lengthMode === previous.lengthMode &&
    next.structureSeed === previous.structureSeed &&
    next.voice.id === previous.voice.id &&
    next.contentFocusSeed === previous.contentFocusSeed &&
    next.highlightTheme === previous.highlightTheme
  ) {
    next = pickNoAnswerVariation(reviewThemes);
    attempts++;
  }
  return next;
}

function pickRandomTheme(themes: string[]): string | undefined {
  if (themes.length === 0) return undefined;
  return themes[Math.floor(Math.random() * themes.length)];
}

/** True when customer Q&A already talks about returning / visiting again. */
export function answersAllowReturnMention(qas: QA[]): boolean {
  const blob = qas.map((qa) => `${qa.question} ${qa.answer}`).join(" ").toLowerCase();
  return /\b(come back|coming back|go back|going back|visit again|visiting again|return|be back|i'?ll be back|would return)\b/.test(
    blob
  );
}
