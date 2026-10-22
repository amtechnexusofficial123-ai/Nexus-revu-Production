import { db } from "@/db";
import { businesses, questions } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import type { QuestionType } from "@/lib/questionTypes";

export type ReviewQuestionBusiness = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  enabled: boolean;
  billingMode: string;
  razorpaySubscriptionStatus: string | null;
  paidUntil: Date | null;
};

export type ReviewQuestionPoolRow = {
  id: string;
  text: string;
  type: QuestionType;
  options: string[] | null;
  alwaysAsk: boolean;
};

const QUESTIONS_CACHE_TTL_MS = 15_000;
const questionsCache = new Map<
  string,
  { expiresAt: number; business: ReviewQuestionBusiness; pool: ReviewQuestionPoolRow[] }
>();

export async function loadBusinessQuestionPool(slug: string) {
  const cached = questionsCache.get(slug);
  if (cached && cached.expiresAt > Date.now()) return cached;

  const rows = await db
    .select({
      business: {
        id: businesses.id,
        name: businesses.name,
        slug: businesses.slug,
        logoUrl: businesses.logoUrl,
        enabled: businesses.enabled,
        billingMode: businesses.billingMode,
        razorpaySubscriptionStatus: businesses.razorpaySubscriptionStatus,
        paidUntil: businesses.paidUntil,
      },
      question: {
        id: questions.id,
        text: questions.text,
        type: questions.type,
        options: questions.options,
        alwaysAsk: questions.alwaysAsk,
      },
    })
    .from(businesses)
    .leftJoin(
      questions,
      and(eq(questions.businessId, businesses.id), eq(questions.active, true))
    )
    .where(eq(businesses.slug, slug));

  const business = rows[0]?.business;
  if (!business) return null;

  const pool = rows
    .map((row) => row.question)
    .filter((question): question is ReviewQuestionPoolRow => question?.id != null);
  const entry = { expiresAt: Date.now() + QUESTIONS_CACHE_TTL_MS, business, pool };
  questionsCache.set(slug, entry);
  return entry;
}
