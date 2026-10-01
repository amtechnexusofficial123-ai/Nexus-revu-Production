export type QA = { question: string; answer: string };

export type LengthMode = "single" | "two_liner" | "short";

/** Length bands baked into the first Gemini prompt (no re-roll). */
export type LengthBand = {
  minWords: number;
  maxWords: number;
  /** At most this many sentences (single). */
  maxSentences?: number;
  /** Exactly this many sentences OR newline-separated lines (two_liner). */
  exactUnits?: number;
};

export const LENGTH_BANDS: Record<LengthMode, LengthBand> = {
  single: { minWords: 8, maxWords: 18, maxSentences: 1 },
  two_liner: { minWords: 14, maxWords: 32, exactUnits: 2 },
  short: { minWords: 28, maxWords: 55 },
};

/** Aim points inside each hard band (never outside). */
export const TARGET_LENGTHS = [32, 38, 44, 50] as const;
export const SINGLE_SENTENCE_TARGET_LENGTHS = [10, 12, 14, 16] as const;
export const TWO_LINER_TARGET_LENGTHS = [18, 22, 26, 30] as const;

/** Messy / non-formula shapes — never opening + service + closing.
 *  No example openers in the text — models copy those into every draft. */
export const STRUCTURE_SEEDS = [
  "One casual sentence only — stop there, no wrap-up",
  "Two short lines that feel a bit disjointed, like a phone note",
  "Start mid-thought and trail off — no stock opener",
  "Just dump one specific detail — no intro, no closing",
  "Sound like a rough text to a friend — incomplete ok",
  "Lead with the answer, then a half-finished second beat",
  "Tiny fragment first, then one plain sentence",
  "Skip the setup — jump straight into what stood out",
] as const;

/** Sharply different voices so drafts don't all blend into the same casual tone. */
export type VoiceProfile = {
  id: "blunt" | "warm" | "dry" | "chatty" | "choppy";
  label: string;
  dos: readonly [string, string, string];
  donts: readonly [string, string, string];
};

export const VOICE_PROFILES: readonly VoiceProfile[] = [
  {
    id: "blunt",
    label: "Blunt / matter-of-fact",
    dos: [
      "Short plain statements only",
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
    id: "dry",
    label: "Dry / understated",
    dos: [
      "Underplay the praise — keep it low-key",
      "A slight dry edge is ok",
      "Prefer 'ok', 'decent', 'fine' over strong adjectives",
    ],
    donts: [
      "No gushing or excitement",
      "No warm fuzzy wording",
      "No enthusiastic ! or hype",
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
      "Very short beats, almost incomplete",
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

export const CONTENT_FOCUS_SEEDS = [
  "Focus on one product or thing they tried",
  "Focus on first impression walking in",
  "Focus on staff or how they were treated",
  "Focus on quality or value",
  "Focus on atmosphere or vibe",
  "Focus on a specific occasion (quick stop, birthday order, etc.)",
  "Focus on one concrete detail from context — nothing else",
] as const;

export type VariationBundle = {
  targetWords: number;
  structureSeed: string;
  voice: VoiceProfile;
  /** Label only — prefer `voice` for rules. */
  voiceSeed: string;
  leadQa: QA;
  contentFocusSeed?: string;
  highlightTheme?: string;
  singleSentence: boolean;
  lengthMode: LengthMode;
};

const SINGLE_STRUCTURE = "One casual sentence only — stop there, no wrap-up";
const TWO_LINER_STRUCTURE =
  "Two short lines that feel a bit disjointed, like a phone note";

/** ~35% single, ~35% two-liner, ~30% short multi. */
function pickLengthMode(): LengthMode {
  const r = Math.random();
  if (r < 0.35) return "single";
  if (r < 0.7) return "two_liner";
  return "short";
}

function pickTargetWords(mode: LengthMode): number {
  if (mode === "single") return pickRandom(SINGLE_SENTENCE_TARGET_LENGTHS);
  if (mode === "two_liner") return pickRandom(TWO_LINER_TARGET_LENGTHS);
  return pickRandom(TARGET_LENGTHS);
}

function pickStructureSeed(mode: LengthMode): string {
  if (mode === "single") return SINGLE_STRUCTURE;
  if (mode === "two_liner") return TWO_LINER_STRUCTURE;
  const multi = STRUCTURE_SEEDS.filter(
    (s) => s !== SINGLE_STRUCTURE && s !== TWO_LINER_STRUCTURE
  );
  return pickRandom(multi);
}

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function pickVoice(): VoiceProfile {
  return pickRandom(VOICE_PROFILES);
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
  extras?: Partial<Pick<VariationBundle, "contentFocusSeed" | "highlightTheme">> & {
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
    singleSentence: lengthMode === "single",
    lengthMode,
    contentFocusSeed:
      lengthMode === "short" ? extras?.contentFocusSeed : undefined,
    highlightTheme: extras?.highlightTheme,
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
- Mode: ONE casual sentence only — no second sentence, no wrap-up
- Word count MUST be between ${band.minWords} and ${band.maxWords} (aim ~${targetWords})
- Count the words before you finish — do not write a paragraph`;
  }
  if (mode === "two_liner") {
    return `HARD RULE — LENGTH (must follow on the first try):
- Mode: exactly TWO short lines (or two short sentences), a bit disjointed
- Word count MUST be between ${band.minWords} and ${band.maxWords} total (aim ~${targetWords})
- Count the words before you finish — not a polished single paragraph`;
  }
  return `HARD RULE — LENGTH (must follow on the first try):
- Mode: short multi-beat review — uneven shape, not a neat essay
- Word count MUST be between ${band.minWords} and ${band.maxWords} (aim ~${targetWords})
- Count the words before you finish — do not collapse into one tiny sentence`;
}

export function pickVariation(qas: QA[]): VariationBundle {
  const nonEmpty = qas.filter((qa) => qa.answer.trim());
  const leadQa =
    nonEmpty.length > 0
      ? pickRandom(nonEmpty)
      : { question: "overall experience", answer: "positive visit" };
  return buildBundle(leadQa);
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
    qaKey(next.leadQa) === prevKey
  ) {
    next = pickVariation(qas);
    attempts++;
  }
  return next;
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
