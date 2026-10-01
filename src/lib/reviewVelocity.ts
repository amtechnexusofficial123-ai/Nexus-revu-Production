import { db } from "@/db";
import { reviewSessions } from "@/db/schema";
import { and, eq, gte, isNotNull, sql } from "drizzle-orm";

/** Rolling caps so one QR doesn't flood Google with near-identical drafts. */
function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function draftVelocityLimits() {
  return {
    perHour: envInt("REVIEW_MAX_DRAFTS_PER_HOUR", 10),
    perDay: envInt("REVIEW_MAX_DRAFTS_PER_DAY", 35),
  };
}

export function postVelocityLimits() {
  return {
    perHour: envInt("REVIEW_MAX_POSTS_PER_HOUR", 8),
    perDay: envInt("REVIEW_MAX_POSTS_PER_DAY", 25),
  };
}

async function countDraftsSince(businessId: string, since: Date): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(reviewSessions)
    .where(
      and(
        eq(reviewSessions.businessId, businessId),
        gte(reviewSessions.createdAt, since)
      )
    );
  return row?.n ?? 0;
}

async function countPostsSince(businessId: string, since: Date): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(reviewSessions)
    .where(
      and(
        eq(reviewSessions.businessId, businessId),
        isNotNull(reviewSessions.postedAt),
        gte(reviewSessions.postedAt, since)
      )
    );
  return row?.n ?? 0;
}

export type VelocityCheck = {
  exceeded: boolean;
  reason?: "hour" | "day";
  message?: string;
};

export async function checkDraftVelocity(businessId: string): Promise<VelocityCheck> {
  const { perHour, perDay } = draftVelocityLimits();
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [hourCount, dayCount] = await Promise.all([
    countDraftsSince(businessId, hourAgo),
    countDraftsSince(businessId, dayAgo),
  ]);

  if (hourCount >= perHour) {
    return {
      exceeded: true,
      reason: "hour",
      message: "This review link is busy right now. Please try again in a little while.",
    };
  }
  if (dayCount >= perDay) {
    return {
      exceeded: true,
      reason: "day",
      message: "This review link has reached today's limit. Please try again tomorrow.",
    };
  }
  return { exceeded: false };
}

export async function checkPostVelocity(businessId: string): Promise<VelocityCheck> {
  const { perHour, perDay } = postVelocityLimits();
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [hourCount, dayCount] = await Promise.all([
    countPostsSince(businessId, hourAgo),
    countPostsSince(businessId, dayAgo),
  ]);

  if (hourCount >= perHour) {
    return {
      exceeded: true,
      reason: "hour",
      message: "Too many reviews from this place just now. Please try again later.",
    };
  }
  if (dayCount >= perDay) {
    return {
      exceeded: true,
      reason: "day",
      message: "This place has hit today's review limit. Please try again tomorrow.",
    };
  }
  return { exceeded: false };
}
