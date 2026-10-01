import { db } from "@/db";
import { businesses, reviewBacklog } from "@/db/schema";
import {
  draftBacklogReviewWithGemini,
  isGeminiConfigured,
  type BusinessContext,
} from "@/lib/gemini";
import { and, asc, eq, sql } from "drizzle-orm";

export type ReviewSentiment = "positive" | "neutral" | "negative";

/** Target ready drafts per business: 2 positive, 1 neutral, 2 negative. */
export const BACKLOG_TARGETS: Record<ReviewSentiment, number> = {
  positive: 2,
  neutral: 1,
  negative: 2,
};

export const BACKLOG_TOTAL = Object.values(BACKLOG_TARGETS).reduce((a, b) => a + b, 0);
export const REFILL_COOLDOWN_MS = 30 * 60 * 1000;

function templateBacklogDraft(
  businessName: string,
  sentiment: ReviewSentiment,
  category?: string | null
): string {
  const spot = category?.trim()
    ? `this ${category.trim().toLowerCase()} spot`
    : businessName;

  if (sentiment === "positive") {
    return `Stopped by ${businessName}. Pretty good overall and staff were friendly`;
  }
  if (sentiment === "negative") {
    return `Visited ${businessName}. Wait felt long and things were a bit off`;
  }
  return `Tried ${spot}. It was fine, nothing special`;
}

async function countBySentiment(businessId: string): Promise<Record<ReviewSentiment, number>> {
  const rows = await db
    .select({
      sentiment: reviewBacklog.sentiment,
      count: sql<number>`count(*)::int`,
    })
    .from(reviewBacklog)
    .where(eq(reviewBacklog.businessId, businessId))
    .groupBy(reviewBacklog.sentiment);

  const counts: Record<ReviewSentiment, number> = {
    positive: 0,
    neutral: 0,
    negative: 0,
  };
  for (const row of rows) {
    if (row.sentiment === "positive" || row.sentiment === "neutral" || row.sentiment === "negative") {
      counts[row.sentiment] = Number(row.count) || 0;
    }
  }
  return counts;
}

export async function getBacklogStatus(businessId: string) {
  const [business] = await db
    .select({
      backlogRefillAfter: businesses.backlogRefillAfter,
    })
    .from(businesses)
    .where(eq(businesses.id, businessId));

  const bySentiment = await countBySentiment(businessId);
  const total = bySentiment.positive + bySentiment.neutral + bySentiment.negative;
  const refillAfter = business?.backlogRefillAfter ?? null;
  const cooldownActive = Boolean(refillAfter && refillAfter.getTime() > Date.now());

  return {
    total,
    target: BACKLOG_TOTAL,
    bySentiment,
    targets: BACKLOG_TARGETS,
    refillAfter,
    cooldownActive,
  };
}

/**
 * Take one unused backlog draft matching preferred sentiment (else any).
 * Deletes it from the backlog so it isn't reused.
 */
export async function takeBacklogDraft(
  businessId: string,
  preferred: ReviewSentiment
): Promise<{ draftText: string; sentiment: ReviewSentiment } | null> {
  const order: ReviewSentiment[] =
    preferred === "positive"
      ? ["positive", "neutral", "negative"]
      : preferred === "negative"
        ? ["negative", "neutral", "positive"]
        : ["neutral", "positive", "negative"];

  for (const sentiment of order) {
    const [row] = await db
      .select()
      .from(reviewBacklog)
      .where(
        and(eq(reviewBacklog.businessId, businessId), eq(reviewBacklog.sentiment, sentiment))
      )
      .orderBy(asc(reviewBacklog.createdAt))
      .limit(1);

    if (!row) continue;

    await db.delete(reviewBacklog).where(eq(reviewBacklog.id, row.id));
    return {
      draftText: row.draftText,
      sentiment: row.sentiment as ReviewSentiment,
    };
  }

  return null;
}

async function insertBacklogDraft(
  businessId: string,
  draftText: string,
  sentiment: ReviewSentiment
) {
  if (!draftText.trim()) return;
  await db.insert(reviewBacklog).values({
    businessId,
    draftText: draftText.trim(),
    sentiment,
  });
}

async function generateOneBacklog(
  business: {
    id: string;
    name: string;
    category: string | null;
    description: string | null;
    reviewThemes: string[] | null;
  },
  sentiment: ReviewSentiment,
  recentDrafts: string[]
): Promise<string> {
  if (isGeminiConfigured()) {
    const ctx: BusinessContext = {
      name: business.name,
      category: business.category,
      description: business.description,
      reviewThemes: business.reviewThemes,
    };
    const result = await draftBacklogReviewWithGemini(ctx, sentiment, recentDrafts, business.id);
    return result.draftText;
  }
  return templateBacklogDraft(business.name, sentiment, business.category);
}

/**
 * Top up backlog to target counts. On Gemini failure, sets a 30-minute cooldown.
 * Safe to call often; no-ops while cooldown is active (unless force=true).
 */
export async function ensureBusinessBacklog(
  businessId: string,
  options?: { force?: boolean }
): Promise<void> {
  const [business] = await db.select().from(businesses).where(eq(businesses.id, businessId));
  if (!business) return;

  const now = Date.now();
  if (
    !options?.force &&
    business.backlogRefillAfter &&
    business.backlogRefillAfter.getTime() > now
  ) {
    return;
  }

  const counts = await countBySentiment(businessId);
  const needed: ReviewSentiment[] = [];
  for (const sentiment of Object.keys(BACKLOG_TARGETS) as ReviewSentiment[]) {
    const missing = BACKLOG_TARGETS[sentiment] - counts[sentiment];
    for (let i = 0; i < missing; i++) needed.push(sentiment);
  }
  if (needed.length === 0) {
    if (business.backlogRefillAfter) {
      await db
        .update(businesses)
        .set({ backlogRefillAfter: null })
        .where(eq(businesses.id, businessId));
    }
    return;
  }

  const existing = await db
    .select({ draftText: reviewBacklog.draftText })
    .from(reviewBacklog)
    .where(eq(reviewBacklog.businessId, businessId));
  const recentDrafts = existing.map((r) => r.draftText).filter(Boolean);

  try {
    for (const sentiment of needed) {
      const draftText = await generateOneBacklog(business, sentiment, recentDrafts);
      await insertBacklogDraft(businessId, draftText, sentiment);
      recentDrafts.push(draftText);
    }
    await db
      .update(businesses)
      .set({ backlogRefillAfter: null })
      .where(eq(businesses.id, businessId));
  } catch (err) {
    console.error(`Backlog refill failed for business ${businessId}, retry in 30m:`, err);
    await db
      .update(businesses)
      .set({ backlogRefillAfter: new Date(now + REFILL_COOLDOWN_MS) })
      .where(eq(businesses.id, businessId));
  }
}

/** Fire-and-forget refill; errors are logged inside ensureBusinessBacklog. */
export function scheduleBacklogRefill(businessId: string): void {
  void ensureBusinessBacklog(businessId).catch((err) => {
    console.error("scheduleBacklogRefill error:", err);
  });
}
